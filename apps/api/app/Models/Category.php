<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    use HasUuids;

    protected $table = 'categories';

    // nevela:generated:start hash=31771532d382
    protected $fillable = ['name', 'slug', 'image'];

    protected function casts(): array
    {
        return [

        ];
    }

    public function products(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Product::class, 'category_id');
    }
    // nevela:generated:end

    // Your own relationships, scopes and accessors go here — outside the generated block.
}
