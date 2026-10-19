from rest_framework import serializers
from .models import Shipment, ShipmentEvent, ReturnRequest, Refund


class ShipmentEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipmentEvent
        fields = ['status', 'occurred_at']


class ShipmentSerializer(serializers.ModelSerializer):
    events = ShipmentEventSerializer(many=True, read_only=True)

    class Meta:
        model = Shipment
        fields = ['id', 'order', 'carrier', 'tracking_number', 'tracking_url', 'status', 'delivered_at', 'created_at', 'events']
        read_only_fields = ['delivered_at', 'created_at']

    def validate_tracking_url(self, value):
        if value and not value.startswith('https://'):
            raise serializers.ValidationError('Use an HTTPS tracking URL.')
        return value

    def validate(self, attrs):
        order = attrs.get('order', getattr(self.instance, 'order', None))
        if self.instance and order.pk != self.instance.order_id:
            raise serializers.ValidationError({'order': 'Shipment order cannot change.'})
        if not self.instance and order.status not in ['paid', 'processing', 'shipped']:
            raise serializers.ValidationError({'order': 'Only confirmed paid orders can be shipped.'})
        if self.instance and self.instance.status == 'delivered' and attrs.get('status', 'delivered') != 'delivered':
            raise serializers.ValidationError({'status': 'Delivered shipments cannot be moved backwards.'})
        if self.instance and self.instance.status != 'label_created' and attrs.get('status') == 'label_created':
            raise serializers.ValidationError({'status': 'Cannot move back to label creation.'})
        return attrs


class ReturnSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnRequest
        fields = ['id', 'order', 'item', 'quantity', 'reason', 'status', 'restocked', 'created_at']
        read_only_fields = ['status', 'restocked', 'created_at']


class RefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refund
        fields = ['id', 'amount', 'currency', 'status', 'created_at']
        read_only_fields = fields


class AdminRefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refund
        fields = ['id', 'order', 'return_request', 'amount', 'currency', 'status', 'reason',
                  'provider_reference', 'idempotency_key', 'created_by', 'created_at']
        read_only_fields = fields
