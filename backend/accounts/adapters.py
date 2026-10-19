from allauth.account.adapter import DefaultAccountAdapter

class CustomAccountAdapter(DefaultAccountAdapter):
    def generate_unique_username(self, txt):
        # If no username provided, use email
        return txt.replace('@', '+').replace('.', '+')

    def save_user(self, request, user, form, commit=True):
        user = super().save_user(request, user, form, commit=False)
        if not user.username:
            user.username = self.generate_unique_username(user.email)
        if commit:
            user.save()
            # Create profile if not exists
            from .models import UserProfile
            UserProfile.objects.get_or_create(user=user)
        return user
