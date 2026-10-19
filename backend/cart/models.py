from django.utils import timezone

from django.db import models
from django.conf import settings
from products.models import Variant
from decimal import Decimal, ROUND_HALF_UP
import uuid


class Cart(models.Model):
    """
    A shopping cart. Tied to a user (nullable for guests) or a session key.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name='carts')
    voucher = models.ForeignKey('Voucher', on_delete=models.SET_NULL, null=True, blank=True)
    session_key = models.CharField(max_length=40, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user'], condition=models.Q(user__isnull=False),
                                               name='cart_one_per_user')]

    def __str__(self):
        if self.user:
            return f"Cart for {self.user.email}"
        return f"Guest cart {self.session_key}"

    @property
    def total_price(self):
        """Sum of line totals, not including any potential global discount."""
        return sum(item.line_total for item in self.items.all())

    @property
    def total_items(self):
        return sum(item.quantity for item in self.items.all())


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    variant = models.ForeignKey(Variant, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('cart', 'variant')

    def __str__(self):
        return f"{self.quantity} x {self.variant.sku}"

    @property
    def unit_price(self):
        """The effective price after any applicable offer."""
        from products.promotions import quote_line
        return quote_line(self.variant, self.quantity)['unit_price']

    @property
    def line_total(self):
        from products.promotions import quote_line
        return quote_line(self.variant, self.quantity)['line_total']

    @property
    def promotion_discount(self):
        return self.variant.price * self.quantity - self.line_total


class Order(models.Model):
    """
    A completed checkout.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Payment'),
        ('paid', 'Paid'),
        ('processing', 'Processing'),
        ('shipped', 'Shipped'),
        ('cancelled', 'Cancelled'),
        ('refunded', 'Refunded'),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    email = models.EmailField()
    order_number = models.CharField(max_length=20, unique=True, editable=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    shipping_name = models.CharField(max_length=100)
    shipping_address = models.TextField()
    shipping_city = models.CharField(max_length=100)
    shipping_postcode = models.CharField(max_length=20)
    shipping_country = models.CharField(max_length=100)
    voucher = models.ForeignKey('Voucher', on_delete=models.PROTECT, null=True, blank=True)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refunded_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=20, default="stripe")
    payment_reference = models.CharField(max_length=255, blank=True)
    currency = models.CharField(max_length=3, default="gbp")
    payment_intent_id = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = uuid.uuid4().hex[:12].upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Order {self.order_number}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    variant = models.ForeignKey(Variant, on_delete=models.SET_NULL, null=True)
    sku = models.CharField(max_length=50)
    product_name = models.CharField(max_length=255)
    size = models.CharField(max_length=50, blank=True)
    shade = models.CharField(max_length=50, blank=True)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.quantity} x {self.product_name}"


class Voucher(models.Model):
    code = models.CharField(max_length=40, unique=True)
    kind = models.CharField(max_length=12, choices=[('percentage', 'Percentage'), ('fixed', 'Fixed')])
    value = models.DecimalField(max_digits=10, decimal_places=2)
    min_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    max_uses = models.PositiveIntegerField(null=True, blank=True)
    used_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['code']

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)


class OrderAccessToken(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='access_tokens')
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
