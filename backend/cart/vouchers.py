from decimal import Decimal
from django.db import transaction
from django.db.models import F
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from rest_framework import serializers, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from products.promotions import money
from .models import Voucher


def discount_for(voucher, subtotal):
    if not voucher:
        return Decimal('0.00')
    now = timezone.now()
    if not voucher.is_active or not voucher.valid_from <= now <= voucher.valid_to:
        raise ValidationError({'voucher': 'This voucher is unavailable or expired.'})
    if voucher.max_uses is not None and voucher.used_count >= voucher.max_uses:
        raise ValidationError({'voucher': 'This voucher has reached its usage limit.'})
    if subtotal < voucher.min_subtotal:
        raise ValidationError({'voucher': 'The minimum order subtotal has not been reached.'})
    amount = subtotal * voucher.value / 100 if voucher.kind == 'percentage' else voucher.value
    return money(min(Decimal(subtotal), money(amount)))


class VoucherSerializer(serializers.ModelSerializer):
    value = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('.01'))
    min_subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False)
    max_uses = serializers.IntegerField(min_value=1, allow_null=True, required=False)

    class Meta:
        model = Voucher
        fields = '__all__'
        read_only_fields = ['used_count']

    def validate_code(self, value):
        code = value.strip().upper()
        if Voucher.objects.filter(code=code).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise ValidationError('This voucher code already exists.')
        return code

    def validate(self, attrs):
        def value(key):
            return attrs.get(key, getattr(self.instance, key, None))
        if value('valid_to') <= value('valid_from'):
            raise ValidationError({'valid_to': 'Voucher must end after it starts.'})
        if value('kind') == 'percentage' and value('value') > 100:
            raise ValidationError({'value': 'Percentage cannot exceed 100.'})
        return attrs


class AdminVoucherViewSet(viewsets.ModelViewSet):
    queryset = Voucher.objects.all()
    serializer_class = VoucherSerializer
    permission_classes = [permissions.IsAdminUser]

    def destroy(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'detail': 'Voucher has orders. Deactivate it instead.'}, status=409)
