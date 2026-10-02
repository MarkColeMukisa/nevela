<?php

namespace App\Http\Resources\Nevela;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A Product as Flare's client expects it: camelCase keys, unwrapped. */
class ProductResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // nevela:generated:start hash=ac8153e48499
            'name' => $this->name,
            'sku' => $this->sku,
            'price' => $this->price,
            'active' => $this->active,
            'kind' => $this->kind,
            'notes' => $this->notes,
            // nevela:generated:end
            'createdAt' => $this->created_at?->toJSON(),
            'updatedAt' => $this->updated_at?->toJSON(),
        ];
    }
}
