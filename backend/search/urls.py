from django.urls import path
from .views import ProductSearchView, SuggestionsView

urlpatterns = [path('suggestions/', SuggestionsView.as_view(), name='search-suggestions'), path('', ProductSearchView.as_view(), name='product-search')]
