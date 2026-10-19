<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** The same model Nevela generates, with Laravel's own soft deletes for its trash. */
class Product extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = ['name', 'sku', 'description', 'price', 'stock', 'active'];

    protected function casts(): array
    {
        return [
            'price' => 'float',
            'stock' => 'integer',
            'active' => 'boolean',
        ];
    }
}
