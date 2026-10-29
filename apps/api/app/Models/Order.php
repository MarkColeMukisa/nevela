<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use HasUuids;

    protected $table = 'orders';

    // nevela:generated:start hash=3e578c0d0a80
    // Deleted records go to the trash, where they can be restored for a while.
    use \Nevela\Laravel\Concerns\Trashable;
    // $record->optionLabel('status'): what its value is called, in the dashboard's words.
    use \Nevela\Laravel\Concerns\OptionLabels;
    // Numbered by Laravel when made without one: ORD-0001, ORD-0002.
    use \Nevela\Laravel\Concerns\Numbered;

    protected function numbered(): array
    {
        return ['number' => 'ORD'];
    }

    protected $fillable = ['number', 'customer', 'email', 'phone', 'status', 'total', 'notes'];

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

    /**
     * Which orders someone sees: whoever may change orders sees them all, and someone who
     * may only look sees the ones placed with their email, as a customer sees their own.
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        if (! $user->can('orders.edit')) {
            $query->where('email', $user->email);
        }
    }

    /** Called once its lines are saved: the order's total is what they come to. */
    public function itemsSaved(): void
    {
        $this->update(['total' => $this->orderItems()->get()->sum(fn (OrderItem $item) => $item->quantity * $item->price)]);
    }
}
