from rest_framework import serializers
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = ['id', 'name', 'slug', 'description', 'features', 'price', 'interval', 'interval_count', 'image', 'is_active']


class UserSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = UserSubscription
        fields = [
            'id', 'plan', 'status', 'start_date', 'current_period_start',
            'current_period_end', 'next_billing_date', 'cancelled_at'
        ]


class SubscriptionOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionOrder
        fields = ['id', 'order_number', 'amount', 'status', 'created_at']


class SubscribeSerializer(serializers.Serializer):
    plan_id = serializers.IntegerField(required=True)
    # Optional: payment nonce if integrating payment immediately
