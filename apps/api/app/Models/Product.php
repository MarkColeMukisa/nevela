<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasUuids;

    protected $table = 'products';

    // nevela:generated:start hash=fa775abae288
    // Deleted records go to the trash, where they can be restored for a while.
    use \Nevela\Laravel\Concerns\Trashable;
    // $record->optionLabel('status'): what its value is called, in the dashboard's words.
    use \Nevela\Laravel\Concerns\OptionLabels;

    protected $fillable = ['name', 'sku', 'price', 'image', 'category_id', 'active', 'kind', 'download_url', 'notes'];

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

    public function orderItems(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(OrderItem::class, 'product_id');
    }
    // nevela:generated:end

    // Relationships, scopes and accessors go here — outside the generated block.
}
