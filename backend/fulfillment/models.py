import uuid
from django.conf import settings
from django.db import models


class Shipment(models.Model):
    STATUS = [('label_created', 'Label created'), ('in_transit', 'In transit'),
              ('delivered', 'Delivered'), ('exception', 'Exception')]
    order = models.ForeignKey('cart.Order', on_delete=models.PROTECT, related_name='shipments')
    carrier = models.CharField(max_length=100)
    tracking_number = models.CharField(max_length=150)
    tracking_url = models.URLField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='label_created')
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['pk']
        constraints = [models.UniqueConstraint(fields=['order', 'carrier', 'tracking_number'], name='shipment_unique_tracking')]


class ShipmentEvent(models.Model):
    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name='events')
    status = models.CharField(max_length=20)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['occurred_at', 'pk']


class ReturnRequest(models.Model):
    STATUS = [('requested', 'Requested'), ('approved', 'Approved'), ('rejected', 'Rejected'),
              ('received', 'Received'), ('closed', 'Closed')]
    order = models.ForeignKey('cart.Order', on_delete=models.PROTECT, related_name='returns')
    item = models.ForeignKey('cart.OrderItem', on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    reason = models.TextField(max_length=2000)
    status = models.CharField(max_length=15, choices=STATUS, default='requested')
    staff_note = models.TextField(blank=True, max_length=2000)
    restocked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']


class Refund(models.Model):
    STATUS = [('pending', 'Pending'), ('succeeded', 'Succeeded'), ('failed', 'Failed'),
              ('requires_manual', 'Manual handling required')]
    order = models.ForeignKey('cart.Order', on_delete=models.PROTECT, related_name='refunds')
    return_request = models.ForeignKey(ReturnRequest, on_delete=models.PROTECT, null=True, blank=True, related_name='refunds')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=20, choices=STATUS, default='pending')
    reason = models.CharField(max_length=500)
    idempotency_key = models.UUIDField(unique=True, default=uuid.uuid4)
    provider_reference = models.CharField(max_length=255, unique=True, null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']
