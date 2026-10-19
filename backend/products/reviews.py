from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import serializers, viewsets, permissions
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import Review
from .catalogue import visible_products


class ReviewSerializer(serializers.ModelSerializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    product = serializers.PrimaryKeyRelatedField(queryset=visible_products())
    verified_purchase = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ['id', 'product', 'rating', 'title', 'body', 'is_approved', 'verified_purchase', 'created_at']
        read_only_fields = ['is_approved', 'created_at']

    def get_verified_purchase(self, obj):
        from cart.models import OrderItem
        return OrderItem.objects.filter(order__user=obj.user, order__status__in=['paid', 'processing', 'shipped'],
                                        variant__product=obj.product).exists()


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        query = Review.objects.filter(product__in=visible_products())
        if self.request.user.is_authenticated:
            query = query.filter(Q(is_approved=True) | Q(user=self.request.user))
        else:
            query = query.filter(is_approved=True)
        product = self.request.query_params.get('product')
        if product is not None:
            field = serializers.IntegerField(min_value=1)
            query = query.filter(product_id=field.run_validation(product))
        return query.select_related('product', 'user')

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(user=self.request.user, is_approved=False)
        except IntegrityError:
            raise ValidationError({'product': 'You have already reviewed this product.'})

    def perform_update(self, serializer):
        if serializer.instance.user_id != self.request.user.pk:
            raise PermissionDenied('Only the author may edit this review.')
        if 'product' in serializer.validated_data and serializer.validated_data['product'].pk != serializer.instance.product_id:
            raise ValidationError({'product': 'A review cannot be moved to another product.'})
        serializer.save(is_approved=False)

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.pk:
            raise PermissionDenied('Only the author may delete this review.')
        instance.delete()


class ModerationSerializer(ReviewSerializer):
    product = serializers.PrimaryKeyRelatedField(read_only=True)
    rating = serializers.IntegerField(read_only=True)
    class Meta(ReviewSerializer.Meta):
        read_only_fields = ['product', 'rating', 'title', 'body', 'created_at']


class AdminReviewViewSet(viewsets.ModelViewSet):
    queryset = Review.objects.select_related('product', 'user').all()
    serializer_class = ModerationSerializer
    permission_classes = [permissions.IsAdminUser]
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']
