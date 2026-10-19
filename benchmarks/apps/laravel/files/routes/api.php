<?php

use App\Http\Controllers\ProductController;
use Illuminate\Support\Facades\Route;

// The same three routes for both plain apps. BENCH_AUTH puts them behind Sanctum, as
// Nevela's are, so that what signing in costs can be told apart from what Nevela does.
$products = function () {
    Route::get('products', [ProductController::class, 'index']);
    Route::post('products', [ProductController::class, 'store']);
    Route::get('products/{product}', [ProductController::class, 'show']);
};

if (env('BENCH_AUTH')) {
    Route::middleware('auth:sanctum')->group($products);
} else {
    $products();
}
