<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    use HasUuids;

    protected $table = 'categories';

    // nevela:generated:start hash=2c9dae15254f
    // Deleted records go to the trash, where they can be restored for a while.
    use \Nevela\Laravel\Concerns\Trashable;

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
