<?php

namespace App\Http\Requests\Nevela;

use App\Models\Order;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Nevela\Laravel\Http\ResourceRequest;

/**
 * Validation for creating (POST), replacing (PUT) and patching (PATCH) a Order.
 * PATCH makes every rule "sometimes"; PUT clears optional fields left out.
 */
class OrderRequest extends ResourceRequest
{
    public function authorize(): bool
    {
        $order = $this->route('order');

        return $order instanceof Order
            ? Gate::allows('update', $order)
            : Gate::allows('create', Order::class);
    }

    // nevela:generated:start hash=078781213076
    public function rules(): array
    {
        $order = $this->route('order');

        return [
            'number' => ['required', 'string', 'max:255', Rule::unique('orders', 'number')->ignore($order)],
            'customer' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'status' => ['required', Rule::in(['pending', 'paid', 'shipped', 'cancelled'])],
            'total' => ['nullable', 'numeric'],
            'notes' => ['nullable', 'string', 'max:65535'],
        ];
    }

    protected function columns(): array
    {
        return ['number' => 'number', 'customer' => 'customer', 'email' => 'email', 'status' => 'status', 'total' => 'total', 'notes' => 'notes'];
    }

    /** Its lines, sent as "items": order items, checked by their own rules and saved with it. */
    protected function lineItems(): ?array
    {
        return ['request' => OrderItemRequest::class, 'model' => \App\Models\OrderItem::class, 'field' => 'orderId', 'column' => 'order_id'];
    }
    // nevela:generated:end
}
