from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers, viewsets, permissions
from .models import Address


class AddressSerializer(serializers.ModelSerializer):
    country = serializers.RegexField(r'^[A-Za-z]{2}$')

    class Meta:
        model = Address
        exclude = ['user']

    def validate_country(self, value):
        return value.upper()


class AddressViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        get_user_model().objects.select_for_update().get(pk=self.request.user.pk)
        if serializer.validated_data.get('is_default'):
            self.get_queryset().update(is_default=False)
        serializer.save(user=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        get_user_model().objects.select_for_update().get(pk=self.request.user.pk)
        if serializer.validated_data.get('is_default'):
            self.get_queryset().exclude(pk=serializer.instance.pk).update(is_default=False)
        serializer.save()
