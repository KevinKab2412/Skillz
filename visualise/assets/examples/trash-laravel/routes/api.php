<?php

use App\Http\Controllers\ItemController;
use Illuminate\Support\Facades\Route;

Route::post('/items/', [ItemController::class, 'store']);
Route::get('/items/', [ItemController::class, 'index']);
Route::post('/items/{id}/delete/', [ItemController::class, 'delete'])->whereNumber('id');
Route::post('/items/{id}/restore/', [ItemController::class, 'restore'])->whereNumber('id');
Route::post('/trash/empty/', [ItemController::class, 'empty']);
Route::get('/usage/', [ItemController::class, 'usage']);
