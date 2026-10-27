<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Nevela\OrderItemRequest;
use App\Http\Resources\Nevela\OrderItemResource;
use App\Models\OrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Nevela\Laravel\Nevela;

/**
 * Order items over Flare's REST contract:
 * GET /order-items?page&perPage&sort=-createdAt&q&filter[field] → { data, meta }.
 */
class OrderItemController extends Controller
{
    // nevela:generated:start hash=2ce258d530bf
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', OrderItem::class);

        return Nevela::list(OrderItem::query(), 'OrderItem', $request, OrderItemResource::class);
    }

    public function stats(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', OrderItem::class);

        return Nevela::stats(OrderItem::query(), 'OrderItem', $request);
    }

    public function insights(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', OrderItem::class);

        return Nevela::insights(OrderItem::query(), 'OrderItem', $request);
    }

    public function store(OrderItemRequest $request): JsonResponse
    {
        $orderItem = OrderItem::create($request->values());

        return (new OrderItemResource($orderItem->refresh()))
            ->response()
            ->setStatusCode(201)
            ->header('Location', $request->url().'/'.$orderItem->getKey());
    }

    public function bulk(Request $request): JsonResponse
    {
        Gate::authorize('create', OrderItem::class);

        return Nevela::createMany(OrderItem::class, OrderItemRequest::class, OrderItemResource::class, $request);
    }

    public function show(OrderItem $orderItem): OrderItemResource
    {
        Gate::authorize('view', $orderItem);

        return new OrderItemResource($orderItem);
    }

    public function update(OrderItemRequest $request, OrderItem $orderItem): OrderItemResource
    {
        $orderItem->update($request->values());

        return new OrderItemResource($orderItem->refresh());
    }

    public function destroy(OrderItem $orderItem): Response
    {
        Gate::authorize('delete', $orderItem);
        $orderItem->delete();

        return response()->noContent();
    }
    // nevela:generated:end
}
