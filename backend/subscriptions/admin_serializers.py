from rest_framework import serializers
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder
from django.utils import timezone
from blog.content import clean_article_html

class AdminSubscriptionPlanSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    interval_count = serializers.IntegerField(min_value=1, default=1)

    def validate_features(self, value):
        return clean_article_html(value)

    class Meta:
        model = SubscriptionPlan
        fields = ['id', 'name', 'slug', 'description', 'features', 'price', 'interval', 'interval_count', 'is_active']

class AdminUserSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSubscription
        fields = ['id', 'user', 'plan', 'status', 'start_date', 'current_period_start', 'current_period_end', 'next_billing_date', 'cancelled_at']
        read_only_fields = ['user', 'plan', 'start_date', 'current_period_start', 'current_period_end',
                            'next_billing_date', 'cancelled_at']

    def validate_status(self, value):
        if value == self.instance.status:
            return value
        if self.instance.status not in ['active', 'paused'] or value not in ['paused', 'cancelled']:
            raise serializers.ValidationError('Only pausing or cancellation is supported while recurring billing is disabled.')
        return value

    def update(self, instance, validated_data):
        if validated_data.get('status') == 'cancelled' and instance.status != 'cancelled':
            validated_data['cancelled_at'] = timezone.now()
        return super().update(instance, validated_data)


class AdminSubscriptionOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionOrder
        fields = ['id', 'user', 'subscription', 'order_number', 'amount', 'status', 'created_at']
