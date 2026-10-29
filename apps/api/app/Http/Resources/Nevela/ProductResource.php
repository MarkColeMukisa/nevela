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
            // nevela:generated:start hash=1d068c80667f
            'name' => $this->name,
            'sku' => $this->sku,
            'price' => $this->price,
            'image' => $this->image,
            'imageFile' => \Nevela\Laravel\Nevela::file($this->image),
            'categoryId' => $this->category_id,
            'active' => $this->active,
            'kind' => $this->kind,
            'downloadUrl' => $this->download_url,
            'notes' => $this->notes,
            // nevela:generated:end
            'createdAt' => $this->created_at?->toJSON(),
            'updatedAt' => $this->updated_at?->toJSON(),
        ];
    }
}
