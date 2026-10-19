from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from rest_framework.exceptions import ValidationError
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder
from .serializers import (
    SubscriptionPlanSerializer,
    UserSubscriptionSerializer,
    SubscriptionOrderSerializer,
    SubscribeSerializer,
)


class SubscriptionPlanViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public list and detail of available plans.
    """
    queryset = SubscriptionPlan.objects.filter(is_active=True).order_by('created_at', 'pk')
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [permissions.AllowAny]


class SubscriptionViewSet(viewsets.GenericViewSet):
    """
    User's active subscriptions, history, and management.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSubscriptionSerializer

    def get_queryset(self):
        return UserSubscription.objects.filter(user=self.request.user).select_related('plan').order_by('-created_at', '-pk')

    def list(self, request):
        """List current subscriptions."""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def subscribe(self, request):
        """Start a new subscription."""
        serializer = SubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = get_object_or_404(SubscriptionPlan, pk=serializer.validated_data['plan_id'], is_active=True)

        # Check if user already has an active subscription
        existing = UserSubscription.objects.filter(
            user=request.user,
            plan=plan,
            status='active'
        ).first()
        if existing:
            return Response({'detail': 'You already have an active subscription to this plan.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {'detail': 'Recurring payments are not configured. No subscription was activated or charged.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        """Cancel a subscription."""
        sub = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
        if sub.status == 'cancelled':
            return Response({'detail': 'Subscription cancelled.'})
        if sub.status not in ['active', 'paused']:
            return Response({'detail': 'This subscription cannot be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        sub.status = 'cancelled'
        sub.cancelled_at = timezone.now()
        sub.save()
        return Response({'detail': 'Subscription cancelled.'})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def skip(self, request, pk=None):
        """Skip the next billing period."""
        sub = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
        if sub.status != 'active':
            return Response({'detail': 'This subscription is not active.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            sub.next_billing_date = sub.plan.next_period(sub.next_billing_date)
        except ValueError as exc:
            raise ValidationError({'plan': str(exc)})
        sub.save()
        return Response({'detail': 'Next billing skipped.', 'next_billing_date': sub.next_billing_date})

    @action(detail=False, methods=['get'])
    def history(self, request):
        """List subscription orders."""
        orders = SubscriptionOrder.objects.filter(user=request.user, subscription__user=request.user).order_by('-created_at', '-pk')
        serializer = SubscriptionOrderSerializer(orders, many=True)
        return Response(serializer.data)
