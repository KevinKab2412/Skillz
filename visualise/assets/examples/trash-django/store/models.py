from django.db import models


class Item(models.Model):
    """A file. Deleting moves it to the trash (trashed_at is set); emptying removes it for good."""

    name = models.CharField(max_length=100)
    size = models.PositiveIntegerField(default=0)
    trashed_at = models.DateTimeField(null=True, blank=True)
