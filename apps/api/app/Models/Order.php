<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use HasUuids;

    protected $table = 'orders';

    // nevela:generated:start hash=cc2aead0deed
    // Deleted records go to the trash, where they can be restored for a while.
    use \Nevela\Laravel\Concerns\Trashable;
    // $record->optionLabel('status'): what its value is called, in the dashboard's words.
    use \Nevela\Laravel\Concerns\OptionLabels;

    protected $fillable = ['number', 'customer', 'email', 'status', 'total', 'notes'];

    protected function casts(): array
    {
        return [
            'total' => 'float',
        ];
    }

    public function orderItems(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id')->orderBy('id');
    }
    // nevela:generated:end

    // Your own relationships, scopes and accessors go here — outside the generated block.

    /** Called once its lines are saved: the order's total is what they come to. */
    public function itemsSaved(): void
    {
        $this->update(['total' => $this->orderItems()->get()->sum(fn (OrderItem $item) => $item->quantity * $item->price)]);
    }
}
