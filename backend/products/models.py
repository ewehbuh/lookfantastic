from django.db import models
from django.core.validators import MinValueValidator
from treebeard.mp_tree import MP_Node


class Category(MP_Node):
    """
    Hierarchical category using Materialized Path (treebeard).
    e.g. Skincare > Moisturisers > Night Creams
    """
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    is_active = models.BooleanField(default=True)

    node_order_by = ['name']

    class Meta:
        verbose_name_plural = 'Categories'

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, unique=True)
    logo = models.ImageField(upload_to='brands/', blank=True, null=True)
    description = models.TextField(blank=True)
    website = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    featured = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

class Product(models.Model):
    """
    Main product table. Variants (size/shade) are separate.
    """
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True)
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, related_name='products')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='products')
    description = models.TextField()
    how_to_use = models.TextField(blank=True)
    ingredients = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    featured = models.BooleanField(default=False)        # ← new field
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # SEO
    meta_title = models.CharField(max_length=255, blank=True)
    meta_description = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['brand', 'is_active']),
            models.Index(fields=['category', 'is_active']),
        ]

    def __str__(self):
        return self.name

    @property
    def default_variant(self):
        """Return the first active variant, or the cheapest."""
        variants = self.variants.filter(is_active=True).order_by('price')
        return variants.first()

    @property
    def price(self):
        variant = self.default_variant
        return variant.price if variant else None

    @property
    def compare_at_price(self):
        variant = self.default_variant
        return variant.compare_at_price if variant else None

    @property
    def in_stock(self):
        variant = self.default_variant
        return variant.stock > 0 if variant else False


class Variant(models.Model):
    """
    Individual SKU – size, shade, etc.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    sku = models.CharField(max_length=50, unique=True)
    size = models.CharField(max_length=50, blank=True)          # e.g. "50ml"
    shade = models.CharField(max_length=50, blank=True)         # e.g. "Ivory"
    price = models.DecimalField(max_digits=10, decimal_places=2)
    compare_at_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    stock = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    image = models.ImageField(upload_to='products/', blank=True, null=True)

    class Meta:
        ordering = ['price']

    def __str__(self):
        return f"{self.product.name} - {self.size or self.shade or self.sku}"


class Offer(models.Model):
    """
    Discounts applied to products or categories.
    """
    OFFER_TYPE_CHOICES = [
        ('percentage', 'Percentage off'),
        ('fixed', 'Fixed amount off'),
        ('buy_x_get_y', 'Buy X Get Y Free'),
    ]
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, unique=True)
    offer_type = models.CharField(max_length=20, choices=OFFER_TYPE_CHOICES)
    value = models.DecimalField(max_digits=10, decimal_places=2, help_text="Percentage or fixed amount")
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    products = models.ManyToManyField(Product, through='ProductOffer', related_name='offers')
    categories = models.ManyToManyField(Category, blank=True)
    brands = models.ManyToManyField(Brand, blank=True)

    def __str__(self):
        return self.name


class ProductOffer(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    offer = models.ForeignKey(Offer, on_delete=models.CASCADE)
    additional_value = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True,
                                           help_text="Override the offer value for this product")

    class Meta:
        unique_together = ('product', 'offer')


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/gallery/')
    alt_text = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Image for {self.product.name}"
