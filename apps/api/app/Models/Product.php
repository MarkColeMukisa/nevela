<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasUuids;

    protected $table = 'products';

    // nevela:generated:start hash=e7474ea126e1
    protected $fillable = ['name', 'sku', 'price', 'image', 'category_id', 'active', 'kind', 'notes'];

    protected function casts(): array
    {
        return [
            'price' => 'float',
            'active' => 'boolean',
        ];
    }

    public function category(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }
    // nevela:generated:end

    // Relationships, scopes and accessors go here — outside the generated block.
}
