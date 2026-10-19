from rest_framework import serializers
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder

class AdminSubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = ['id', 'name', 'slug', 'description', 'features', 'price', 'interval', 'interval_count', 'is_active']

class AdminUserSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSubscription
        fields = ['id', 'user', 'plan', 'status', 'start_date', 'current_period_start', 'current_period_end', 'next_billing_date', 'cancelled_at']
        read_only_fields = ['user', 'plan']   # typically you wouldn't change the plan/user

class AdminSubscriptionOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionOrder
        fields = ['id', 'user', 'subscription', 'order_number', 'amount', 'status', 'created_at']
