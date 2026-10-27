<?php

namespace App\Http\Resources\Nevela;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A Order item as Flare's client expects it: camelCase keys, unwrapped. */
class OrderItemResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // nevela:generated:start hash=b1fa54f9c880
            'productId' => $this->product_id,
            'quantity' => $this->quantity,
            'price' => $this->price,
            'orderId' => $this->order_id,
            // nevela:generated:end
            'createdAt' => $this->created_at?->toJSON(),
            'updatedAt' => $this->updated_at?->toJSON(),
        ];
    }
}
