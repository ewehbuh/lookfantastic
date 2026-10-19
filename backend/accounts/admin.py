from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, UserProfile, WishlistItem, PointTransaction

class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = ['email', 'first_name', 'last_name', 'is_banned', 'is_staff']
    ordering = ['email']
    fieldsets = UserAdmin.fieldsets + (
        ('Ban Status', {'fields': ('is_banned', 'banned_until', 'login_disabled')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (None, {'fields': ('email', 'password1', 'password2')}),
    )

admin.site.register(CustomUser, CustomUserAdmin)
admin.site.register(UserProfile)
admin.site.register(WishlistItem)
admin.site.register(PointTransaction)
