<?php

namespace App\Http\Requests\Nevela;

use App\Models\Product;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Nevela\Laravel\Http\ResourceRequest;

/**
 * Validation for creating (POST), replacing (PUT) and patching (PATCH) a Product.
 * PATCH makes every rule "sometimes"; PUT clears optional fields left out.
 */
class ProductRequest extends ResourceRequest
{
    public function authorize(): bool
    {
        $product = $this->route('product');

        return $product instanceof Product
            ? Gate::allows('update', $product)
            : Gate::allows('create', Product::class);
    }

    // nevela:generated:start hash=540d0a71d511
    public function rules(): array
    {
        $product = $this->route('product');

        return [
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['required', 'string', 'max:255', Rule::unique('products', 'sku')->ignore($product)],
            'price' => ['required', 'numeric'],
            'image' => ['nullable', 'string', 'max:512', new \Nevela\Laravel\Rules\UploadKey('Product', 'image')],
            'categoryId' => ['required', 'uuid', Rule::exists('categories', 'id')],
            'active' => ['required', 'boolean'],
            'kind' => ['required', Rule::in(['stock', 'digital'])],
            'notes' => ['nullable', 'string', 'max:65535'],
        ];
    }

    protected function columns(): array
    {
        return ['name' => 'name', 'sku' => 'sku', 'price' => 'price', 'image' => 'image', 'categoryId' => 'category_id', 'active' => 'active', 'kind' => 'kind', 'notes' => 'notes'];
    }
    // nevela:generated:end
}
