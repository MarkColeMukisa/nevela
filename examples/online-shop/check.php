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

// Anyone: only the products on sale, and only the fields the public section names.
App\Models\Product::query()->limit(3)->update(['active' => false]);
[$status, $list] = $call('GET', '/api/public/products?perPage=100');
$hidden = App\Models\Product::where('active', false)->pluck('id')->all();
echo 'public only on sale: ', $status === 200 && $list['data'] !== [] && array_intersect(array_column($list['data'], 'id'), $hidden) === [] ? 'yes' : "no ({$status})", PHP_EOL;
echo 'public fields: ', implode(',', array_keys($list['data'][0] ?? [])), PHP_EOL;

// Signed in: an order of two lines comes back with their total.
Laravel\Sanctum\Sanctum::actingAs(App\Models\User::where('email', 'admin@example.com')->firstOrFail());
[$first, $second] = App\Models\Product::query()->limit(2)->pluck('id')->all();
[$status, $order] = $call('POST', '/api/orders', [
    'number' => 'ORD-1001',
    'customer' => 'Amara Okafor',
    'email' => 'amara@example.com',
    'items' => [
        ['productId' => $first, 'quantity' => 2, 'price' => 49.5],
        ['productId' => $second, 'quantity' => 1, 'price' => 8.5],
    ],
]);
echo "order {$status} {$order['status']}", PHP_EOL;
echo 'total ', App\Models\Order::where('number', 'ORD-1001')->value('total'), PHP_EOL;
