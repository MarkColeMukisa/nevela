<?php

use Illuminate\Support\Facades\Route;

// Loaded by Nevela under the prefix and middleware in config/nevela.php
// (default: /api, auth:sanctum). Add your own routes below the generated block.
// nevela:generated:start hash=1e7dd1141485
Route::get('categories/_stats', [\App\Http\Controllers\Api\CategoryController::class, 'stats'])->name('categories.stats');
Route::apiResource('categories', \App\Http\Controllers\Api\CategoryController::class);
Route::get('products/_stats', [\App\Http\Controllers\Api\ProductController::class, 'stats'])->name('products.stats');
Route::apiResource('products', \App\Http\Controllers\Api\ProductController::class);
// nevela:generated:end
