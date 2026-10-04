<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Nevela\CategoryRequest;
use App\Http\Resources\Nevela\CategoryResource;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Nevela\Laravel\Nevela;

/**
 * Categories over Flare's REST contract:
 * GET /categories?page&perPage&sort=-createdAt&q&filter[field] → { data, meta }.
 */
class CategoryController extends Controller
{
    // nevela:generated:start hash=f86eea4a4720
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Category::class);

        return Nevela::list(Category::query(), 'Category', $request, CategoryResource::class);
    }

    public function stats(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Category::class);

        return Nevela::stats(Category::query(), 'Category', $request);
    }

    public function store(CategoryRequest $request): JsonResponse
    {
        $category = Category::create($request->values());

        return (new CategoryResource($category->refresh()))
            ->response()
            ->setStatusCode(201)
            ->header('Location', $request->url().'/'.$category->getKey());
    }

    public function show(Category $category): CategoryResource
    {
        Gate::authorize('view', $category);

        return new CategoryResource($category);
    }

    public function update(CategoryRequest $request, Category $category): CategoryResource
    {
        $category->update($request->values());

        return new CategoryResource($category->refresh());
    }

    public function destroy(Category $category): Response|JsonResponse
    {
        Gate::authorize('delete', $category);
        if (($count = \App\Models\Product::query()->where('category_id', $category->getKey())->count()) > 0) {
            return response()->json(['error' => "{$count} products belong to this category. Move or delete them first."], 409);
        }
        $category->delete();

        return response()->noContent();
    }
    // nevela:generated:end
}
