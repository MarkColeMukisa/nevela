<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    use HasUuids;

    protected $table = 'order_items';

    // nevela:generated:start hash=85222a5ddb5d
    // Deleted records go to the trash, where they can be restored for a while.
    use \Nevela\Laravel\Concerns\Trashable;

    protected $fillable = ['product_id', 'quantity', 'price', 'order_id'];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'price' => 'float',
        ];
    }

    public function product(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function order(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }
    // nevela:generated:end

    // Your own relationships, scopes and accessors go here — outside the generated block.
}
