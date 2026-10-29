<?php

namespace App\Http\Resources\Nevela;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A Order as Flare's client expects it: camelCase keys, unwrapped. */
class OrderResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // nevela:generated:start hash=6234887b13bd
            'number' => $this->number,
            'customer' => $this->customer,
            'email' => $this->email,
            'phone' => $this->phone,
            'status' => $this->status,
            'total' => $this->total,
            'notes' => $this->notes,
            'items' => $this->whenLoaded('orderItems', fn () => OrderItemResource::collection($this->orderItems)->resolve($request)),
            // nevela:generated:end
            'createdAt' => $this->created_at?->toJSON(),
            'updatedAt' => $this->updated_at?->toJSON(),
        ];
    }
}
