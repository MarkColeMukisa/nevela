<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Nevela\ProductRequest;
use App\Http\Resources\Nevela\ProductResource;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Nevela\Laravel\Nevela;

/**
 * Products over Flare's REST contract:
 * GET /products?page&perPage&sort=-createdAt&q&filter[field] → { data, meta }.
 */
class ProductController extends Controller
{
    // nevela:generated:start hash=a6c8a98da0a9
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Product::class);

        return Nevela::list(Product::query(), 'Product', $request, ProductResource::class);
    }

    public function stats(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Product::class);

        return Nevela::stats(Product::query(), 'Product', $request);
    }

    public function store(ProductRequest $request): JsonResponse
    {
        $product = Product::create($request->values());

        return (new ProductResource($product->refresh()))
            ->response()
            ->setStatusCode(201)
            ->header('Location', $request->url().'/'.$product->getKey());
    }

    public function bulk(Request $request): JsonResponse
    {
        Gate::authorize('create', Product::class);

        return Nevela::createMany(Product::class, ProductRequest::class, ProductResource::class, $request);
    }

    public function show(Product $product): ProductResource
    {
        Gate::authorize('view', $product);

        return new ProductResource($product);
    }

    public function update(ProductRequest $request, Product $product): ProductResource
    {
        $product->update($request->values());

        return new ProductResource($product->refresh());
    }

    public function destroy(Product $product): Response
    {
        Gate::authorize('delete', $product);
        $product->delete();

        return response()->noContent();
    }
    // nevela:generated:end
}
