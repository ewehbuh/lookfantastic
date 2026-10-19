from django.contrib import admin
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder

@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ['name', 'price', 'interval', 'is_active']
    prepopulated_fields = {'slug': ('name',)}

@admin.register(UserSubscription)
class UserSubscriptionAdmin(admin.ModelAdmin):
    list_display = ['user', 'plan', 'status', 'start_date', 'next_billing_date']
    list_filter = ['status']

@admin.register(SubscriptionOrder)
class SubscriptionOrderAdmin(admin.ModelAdmin):
    list_display = ['order_number', 'user', 'subscription', 'amount', 'status', 'created_at']
