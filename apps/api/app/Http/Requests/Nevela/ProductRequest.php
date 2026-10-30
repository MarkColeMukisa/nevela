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

    // nevela:generated:start hash=48b9a310b4b8
    public function rules(): array
    {
        $product = $this->route('product');

        return [
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['required', 'string', 'max:255', Rule::unique('products', 'sku')->ignore($product)],
            'price' => ['required', 'numeric'],
            'image' => ['nullable', 'string', 'max:512', new \Nevela\Laravel\Rules\UploadKey('Product', 'image')],
            'gallery' => ['nullable', 'list', 'max:20'],
            'gallery.*' => ['string', 'distinct', 'max:512', new \Nevela\Laravel\Rules\UploadKey('Product', 'gallery')],
            'categoryId' => ['required', 'uuid', Rule::exists('categories', 'id')],
            'active' => ['required', 'boolean'],
            'kind' => ['required', Rule::in(['stock', 'digital'])],
            'downloadUrl' => ['nullable', 'url', 'max:2048'],
            'notes' => ['nullable', 'string', 'max:65535'],
        ];
    }

    protected function columns(): array
    {
        return ['name' => 'name', 'sku' => 'sku', 'price' => 'price', 'image' => 'image', 'gallery' => 'gallery', 'categoryId' => 'category_id', 'active' => 'active', 'kind' => 'kind', 'downloadUrl' => 'download_url', 'notes' => 'notes'];
    }

    /** Fields whose values go together once only. Checked against the trash too, as the database's index is. */
    protected function together(): array
    {
        return [['fields' => ['categoryId', 'name'], 'table' => 'products', 'message' => 'There is already a product with this category and name.']];
    }

    /** Fields that apply for some values of another only. Elsewhere they are emptied; where they apply, a required one is needed. */
    protected function conditions(): array
    {
        return ['downloadUrl' => ['on' => 'kind', 'values' => ['digital'], 'required' => true, 'message' => 'Needed when the kind is Digital.']];
    }
    // nevela:generated:end
}
