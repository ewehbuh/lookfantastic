from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
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
    queryset = SubscriptionPlan.objects.filter(is_active=True)
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [permissions.AllowAny]


class SubscriptionViewSet(viewsets.GenericViewSet):
    """
    User's active subscriptions, history, and management.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSubscriptionSerializer

    def get_queryset(self):
        return UserSubscription.objects.filter(user=self.request.user).order_by('-created_at')

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
    def cancel(self, request, pk=None):
        """Cancel a subscription."""
        sub = get_object_or_404(UserSubscription, pk=pk, user=request.user)
        if sub.status != 'active':
            return Response({'detail': 'This subscription is not active.'}, status=status.HTTP_400_BAD_REQUEST)
        sub.status = 'cancelled'
        sub.cancelled_at = timezone.now()
        sub.save()
        return Response({'detail': 'Subscription cancelled.'})

    @action(detail=True, methods=['post'])
    def skip(self, request, pk=None):
        """Skip the next billing period."""
        sub = get_object_or_404(UserSubscription, pk=pk, user=request.user)
        if sub.status != 'active':
            return Response({'detail': 'This subscription is not active.'}, status=status.HTTP_400_BAD_REQUEST)
        # Push next billing date forward by one interval
        from dateutil.relativedelta import relativedelta
        sub.next_billing_date += relativedelta(months=1)  # assumes monthly; adjust
        sub.save()
        return Response({'detail': 'Next billing skipped.', 'next_billing_date': sub.next_billing_date})

    @action(detail=False, methods=['get'])
    def history(self, request):
        """List subscription orders."""
        orders = SubscriptionOrder.objects.filter(user=request.user).order_by('-created_at')
        serializer = SubscriptionOrderSerializer(orders, many=True)
        return Response(serializer.data)
