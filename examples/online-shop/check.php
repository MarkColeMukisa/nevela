<?php

// The tutorial's shop, checked: an order made over the API, as its last step makes one, and
// what the public list of products shows. Run from apps/api.
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$http = $app->make(Illuminate\Contracts\Http\Kernel::class);
$call = function (string $method, string $uri, ?array $body = null) use ($http): array {
    $request = Illuminate\Http\Request::create($uri, $method, server: ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], content: $body === null ? null : json_encode($body));
    $response = $http->handle($request);

    return [$response->getStatusCode(), json_decode((string) $response->getContent(), true)];
};

// Seeded: every item costs what its product does.
$off = App\Models\OrderItem::query()->join('products', 'products.id', '=', 'order_items.product_id')->whereColumn('order_items.price', '!=', 'products.price')->count();
echo 'seeded prices are the products\': ', $off === 0 && App\Models\OrderItem::count() > 0 ? 'yes' : "no ({$off})", PHP_EOL;

// Anyone: only the products on sale, and only the fields the public section names.
App\Models\Product::query()->limit(3)->update(['active' => false]);
[$status, $list] = $call('GET', '/api/public/products?perPage=100');
$hidden = App\Models\Product::where('active', false)->pluck('id')->all();
echo 'public only on sale: ', $status === 200 && $list['data'] !== [] && array_intersect(array_column($list['data'], 'id'), $hidden) === [] ? 'yes' : "no ({$status})", PHP_EOL;
echo 'public fields: ', implode(',', array_keys($list['data'][0] ?? [])), PHP_EOL;

// Signed in: an order sent without a number or prices is given both, and its total.
Laravel\Sanctum\Sanctum::actingAs(App\Models\User::where('email', 'admin@example.com')->firstOrFail());
[$first, $second] = App\Models\Product::query()->limit(2)->get()->all();
[$status, $order] = $call('POST', '/api/orders', [
    'customer' => 'Amara Okafor',
    'email' => 'amara@example.com',
    'items' => [
        ['productId' => $first->id, 'quantity' => 2],
        ['productId' => $second->id, 'quantity' => 1],
    ],
]);
echo "order {$status} {$order['number']} {$order['status']}", PHP_EOL;
$expected = round(2 * $first->price + $second->price, 2);
echo 'prices from the products: ', array_map(fn ($item) => (float) $item['price'], $order['items'] ?? []) === [(float) $first->price, (float) $second->price] ? 'yes' : 'no', PHP_EOL;
echo 'total is theirs: ', abs((float) App\Models\Order::where('number', $order['number'])->value('total') - $expected) < 0.005 ? 'yes' : 'no', PHP_EOL;
