from django.urls import path

from store import views

urlpatterns = [
    path("items/", views.items),
    path("items/<int:item_id>/delete/", views.delete),
    path("items/<int:item_id>/restore/", views.restore),
    path("trash/empty/", views.empty),
    path("usage/", views.usage),
]
