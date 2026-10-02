<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasUuids;

    protected $table = 'products';

    // nevela:generated:start hash=8e8c02392131
    protected $fillable = ['name', 'sku', 'price', 'active', 'kind', 'notes'];

    protected function casts(): array
    {
        return [
            'price' => 'float',
            'active' => 'boolean',
        ];
    }
    // nevela:generated:end

    // Relationships, scopes and accessors go here — outside the generated block.
}
