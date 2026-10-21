<?php

namespace App\Http\Controllers;

use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItemController
{
    public function store(Request $request): JsonResponse
    {
        $item = Item::create(['name' => $request->input('name'), 'size' => $request->input('size', 0)]);

        return response()->json(['id' => $item->id, 'name' => $item->name], 201);
    }

    public function index(): JsonResponse
    {
        return response()->json(['items' => Item::orderBy('id')->pluck('name')]);
    }

    public function delete(int $id): JsonResponse
    {
        $item = Item::find($id);
        $item?->delete();

        return $item ? response()->json(['trashed' => $id]) : response()->json(['error' => 'not_found'], 404);
    }

    public function restore(int $id): JsonResponse
    {
        $item = Item::onlyTrashed()->find($id);
        $item?->restore();

        return $item ? response()->json(['restored' => $id]) : response()->json(['error' => 'not_in_trash'], 404);
    }

    public function empty(): JsonResponse
    {
        return response()->json(['removed' => Item::onlyTrashed()->forceDelete()]);
    }

    public function usage(): JsonResponse
    {
        return response()->json(['used' => (int) Item::withTrashed()->sum('size')]);
    }
}
