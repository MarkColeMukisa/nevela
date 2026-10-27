<?php

namespace App\Http\Requests\Nevela;

use App\Models\OrderItem;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Nevela\Laravel\Http\ResourceRequest;

/**
 * Validation for creating (POST), replacing (PUT) and patching (PATCH) a Order item.
 * PATCH makes every rule "sometimes"; PUT clears optional fields left out.
 */
class OrderItemRequest extends ResourceRequest
{
    public function authorize(): bool
    {
        $orderItem = $this->route('order_item');

        return $orderItem instanceof OrderItem
            ? Gate::allows('update', $orderItem)
            : Gate::allows('create', OrderItem::class);
    }

    // nevela:generated:start hash=94ad12139a4d
    public function rules(): array
    {
        $orderItem = $this->route('order_item');

        return [
            'productId' => ['required', 'uuid', Rule::exists('products', 'id')],
            'quantity' => ['required', 'integer'],
            'price' => ['required', 'numeric'],
            'orderId' => ['required', 'uuid', Rule::exists('orders', 'id')],
        ];
    }

    protected function columns(): array
    {
        return ['productId' => 'product_id', 'quantity' => 'quantity', 'price' => 'price', 'orderId' => 'order_id'];
    }
    // nevela:generated:end
}
