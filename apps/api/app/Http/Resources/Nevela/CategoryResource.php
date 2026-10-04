<?php

namespace App\Http\Resources\Nevela;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A Category as Flare's client expects it: camelCase keys, unwrapped. */
class CategoryResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // nevela:generated:start hash=e9dd03526fac
            'name' => $this->name,
            'slug' => $this->slug,
            'image' => $this->image,
            'imageFile' => \Nevela\Laravel\Nevela::file($this->image),
            // nevela:generated:end
            'createdAt' => $this->created_at?->toJSON(),
            'updatedAt' => $this->updated_at?->toJSON(),
        ];
    }
}
