<?php

namespace App\Http\Requests\Nevela;

use App\Models\Category;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Nevela\Laravel\Http\ResourceRequest;

/**
 * Validation for creating (POST), replacing (PUT) and patching (PATCH) a Category.
 * PATCH makes every rule "sometimes"; PUT clears optional fields left out.
 */
class CategoryRequest extends ResourceRequest
{
    public function authorize(): bool
    {
        $category = $this->route('category');

        return $category instanceof Category
            ? Gate::allows('update', $category)
            : Gate::allows('create', Category::class);
    }

    // nevela:generated:start hash=d9f6de43ce20
    public function rules(): array
    {
        $category = $this->route('category');

        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'alpha_dash', 'max:255', Rule::unique('categories', 'slug')->ignore($category)],
            'image' => ['nullable', 'string', 'max:512', new \Nevela\Laravel\Rules\UploadKey('Category', 'image')],
        ];
    }

    protected function columns(): array
    {
        return ['name' => 'name', 'slug' => 'slug', 'image' => 'image'];
    }
    // nevela:generated:end
}
