import json

from django.db.models import Sum
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_POST

from store.models import Item


def items(request):
    if request.method == "POST":
        body = json.loads(request.body or "{}")
        item = Item.objects.create(name=body["name"], size=body.get("size", 0))
        return JsonResponse({"id": item.id, "name": item.name}, status=201)
    names = list(Item.objects.filter(trashed_at__isnull=True).order_by("id").values_list("name", flat=True))
    return JsonResponse({"items": names})


@require_POST
def delete(request, item_id):
    updated = Item.objects.filter(id=item_id, trashed_at__isnull=True).update(trashed_at=timezone.now())
    return JsonResponse({"trashed": item_id} if updated else {"error": "not_found"}, status=200 if updated else 404)


@require_POST
def restore(request, item_id):
    updated = Item.objects.filter(id=item_id, trashed_at__isnull=False).update(trashed_at=None)
    return JsonResponse({"restored": item_id} if updated else {"error": "not_in_trash"}, status=200 if updated else 404)


@require_POST
def empty(request):
    removed, _ = Item.objects.filter(trashed_at__isnull=False).delete()
    return JsonResponse({"removed": removed})


def usage(request):
    return JsonResponse({"used": Item.objects.aggregate(total=Sum("size"))["total"] or 0})
