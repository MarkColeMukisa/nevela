<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Nevela\OrderRequest;
use App\Http\Resources\Nevela\OrderResource;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Nevela\Laravel\Nevela;

/**
 * Orders over Flare's REST contract:
 * GET /orders?page&perPage&sort=-createdAt&q&filter[field] → { data, meta }.
 */
class OrderController extends Controller
{
    // nevela:generated:start hash=77786d91ef34
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Order::class);

        return Nevela::list(Order::query(), 'Order', $request, OrderResource::class);
    }

    public function stats(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Order::class);

        return Nevela::stats(Order::query(), 'Order', $request);
    }

    public function insights(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Order::class);

        return Nevela::insights(Order::query(), 'Order', $request);
    }

    public function store(OrderRequest $request): JsonResponse
    {
        $order = \Illuminate\Support\Facades\DB::transaction(function () use ($request) {
            $order = Order::create($request->values());
            $request->saveItems($order);

            return $order;
        });

        return (new OrderResource($order->refresh()->load('orderItems')))
            ->response()
            ->setStatusCode(201)
            ->header('Location', $request->url().'/'.$order->getKey());
    }

    public function bulk(Request $request): JsonResponse
    {
        Gate::authorize('create', Order::class);

        return Nevela::createMany(Order::class, OrderRequest::class, OrderResource::class, $request);
    }

    public function show(Order $order): OrderResource
    {
        Gate::authorize('view', $order);

        return new OrderResource($order->load('orderItems'));
    }

    public function update(OrderRequest $request, Order $order): OrderResource
    {
        \Illuminate\Support\Facades\DB::transaction(function () use ($request, $order) {
            $order->update($request->values());
            $request->saveItems($order);
        });

        return new OrderResource($order->refresh()->load('orderItems'));
    }

    public function destroy(Order $order): Response
    {
        Gate::authorize('delete', $order);
        $order->delete();

        return response()->noContent();
    }
    // nevela:generated:end
}
