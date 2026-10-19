<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Products, written by hand the way a Laravel developer would without Nevela.
 *
 * It answers what Nevela's generated controller answers, with the same JSON: the same
 * query parameters (page, perPage up to 100, sort, q), the same { data, meta } list and
 * the same keys on a product. Plain Eloquent and arrays, no API Resources, no policy.
 */
class ProductController extends Controller
{
    /** What a list can be sorted by, as the API names it => its column. */
    private const SORTABLE = ['name' => 'name', 'sku' => 'sku', 'price' => 'price', 'stock' => 'stock', 'createdAt' => 'created_at', 'updatedAt' => 'updated_at'];

    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('perPage', 25), 1), 100);
        $page = max((int) $request->query('page', 1), 1);
        $sort = (string) $request->query('sort', '-createdAt');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $column = self::SORTABLE[ltrim($sort, '-')] ?? 'created_at';

        $query = Product::query();
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $pattern = '%'.addcslashes($q, '%_\\').'%';
            $query->where(fn (Builder $where) => $where->whereLike('name', $pattern)->orWhereLike('sku', $pattern)->orWhereLike('description', $pattern));
        }

        $products = $query->orderBy($column, $direction)->orderBy('id', $direction)->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => $products->getCollection()->map(fn (Product $product) => $this->present($product))->all(),
            'meta' => [
                'page' => $products->currentPage(),
                'perPage' => $products->perPage(),
                'total' => $products->total(),
                'totalPages' => max(1, $products->lastPage()),
            ],
        ]);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json($this->present($product));
    }

    public function store(Request $request): JsonResponse
    {
        $valid = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['required', 'string', 'max:255', Rule::unique('products', 'sku')],
            'description' => ['nullable', 'string', 'max:65535'],
            'price' => ['required', 'numeric'],
            'stock' => ['required', 'integer'],
            'active' => ['required', 'boolean'],
        ]);

        $product = Product::create($valid);

        return response()->json($this->present($product), 201)
            ->header('Location', $request->url().'/'.$product->getKey());
    }

    /** @return array<string, mixed> */
    private function present(Product $product): array
    {
        return [
            'id' => $product->id,
            'name' => $product->name,
            'sku' => $product->sku,
            'description' => $product->description,
            'price' => $product->price,
            'stock' => $product->stock,
            'active' => $product->active,
            'createdAt' => $product->created_at?->toJSON(),
            'updatedAt' => $product->updated_at?->toJSON(),
        ];
    }
}
