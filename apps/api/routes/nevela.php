<?php

use Illuminate\Support\Facades\Route;

// Loaded by Nevela under the prefix and middleware in config/nevela.php
// (default: /api, auth:sanctum). Add your own routes below the generated block.
// nevela:generated:start hash=e59cbe0c78cc
Route::get('categories/_stats', [\App\Http\Controllers\Api\CategoryController::class, 'stats'])->name('categories.stats');
Route::get('categories/_insights', [\App\Http\Controllers\Api\CategoryController::class, 'insights'])->name('categories.insights');
Route::post('categories/_bulk', [\App\Http\Controllers\Api\CategoryController::class, 'bulk'])->name('categories.bulk');
Route::apiResource('categories', \App\Http\Controllers\Api\CategoryController::class);
Route::get('order-items/_stats', [\App\Http\Controllers\Api\OrderItemController::class, 'stats'])->name('order-items.stats');
Route::get('order-items/_insights', [\App\Http\Controllers\Api\OrderItemController::class, 'insights'])->name('order-items.insights');
Route::post('order-items/_bulk', [\App\Http\Controllers\Api\OrderItemController::class, 'bulk'])->name('order-items.bulk');
Route::apiResource('order-items', \App\Http\Controllers\Api\OrderItemController::class);
Route::get('orders/_stats', [\App\Http\Controllers\Api\OrderController::class, 'stats'])->name('orders.stats');
Route::get('orders/_insights', [\App\Http\Controllers\Api\OrderController::class, 'insights'])->name('orders.insights');
Route::post('orders/_bulk', [\App\Http\Controllers\Api\OrderController::class, 'bulk'])->name('orders.bulk');
Route::apiResource('orders', \App\Http\Controllers\Api\OrderController::class);
Route::get('products/_stats', [\App\Http\Controllers\Api\ProductController::class, 'stats'])->name('products.stats');
Route::get('products/_insights', [\App\Http\Controllers\Api\ProductController::class, 'insights'])->name('products.insights');
Route::post('products/_bulk', [\App\Http\Controllers\Api\ProductController::class, 'bulk'])->name('products.bulk');
Route::apiResource('products', \App\Http\Controllers\Api\ProductController::class);
// nevela:generated:end
