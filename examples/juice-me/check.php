<?php

// The tutorial's bar, checked: customers who sign up, what each orders and sees, and what only
// the bar decides. Run from apps/api.
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$http = $app->make(Illuminate\Contracts\Http\Kernel::class);
$call = function (string $method, string $uri, ?array $body = null) use ($http): array {
    $request = Illuminate\Http\Request::create($uri, $method, server: ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], content: $body === null ? null : json_encode($body));
    $response = $http->handle($request);

    return [$response->getStatusCode(), json_decode((string) $response->getContent(), true)];
};
$as = fn (string $email) => Laravel\Sanctum\Sanctum::actingAs(App\Models\User::where('email', $email)->firstOrFail());
$none = function () use ($app) {
    $app['auth']->forgetGuards();
    $app->make('request')->setUserResolver(fn () => null);
};

// Two people sign up in the app, and are customers.
foreach ([['Amara Okafor', 'amara@example.com'], ['Bo Ssemakula', 'bo@example.com']] as [$name, $email]) {
    [$status, $body] = $call('POST', '/api/auth/register', ['name' => $name, 'email' => $email, 'password' => 'a good long passphrase']);
    $roles = Nevela\Laravel\Access\Access::rolesOf(App\Models\User::where('email', $email)->firstOrFail())->pluck('name')->all();
    echo "sign-up {$status} ", implode(',', $roles), PHP_EOL;
}

// Amara orders two drinks. She sends no email, number, price or total: Laravel gives them.
$drinks = App\Models\Beverage::query()->where('available', true)->orderBy('name')->limit(2)->get();
$as('amara@example.com');
[$status, $order] = $call('POST', '/api/orders', [
    'customer' => 'Amara Okafor',
    'delivery' => 'collection',
    'items' => [['beverageId' => $drinks[0]->id, 'quantity' => 2], ['beverageId' => $drinks[1]->id, 'quantity' => 1]],
]);
echo "order {$status} {$order['status']} ".(str_starts_with($order['number'] ?? '', 'JM-') ? 'numbered' : 'unnumbered')." {$order['email']}", PHP_EOL;
$expected = round(2 * $drinks[0]->price + $drinks[1]->price, 2);
echo 'prices from the beverages: ', array_map(fn ($item) => (float) $item['price'], $order['items'] ?? []) === [(float) $drinks[0]->price, (float) $drinks[1]->price] ? 'yes' : 'no', PHP_EOL;
echo 'total is theirs: ', abs((float) App\Models\Order::where('number', $order['number'])->value('total') - $expected) < 0.005 ? 'yes' : 'no', PHP_EOL;

// What she can't decide for herself: another's email, a status, a total, a number.
[$status, $forged] = $call('POST', '/api/orders', [
    'customer' => 'Amara Okafor', 'email' => 'bo@example.com', 'status' => 'completed', 'total' => 1, 'number' => 'JM-9999',
    'items' => [['beverageId' => $drinks[0]->id, 'quantity' => 1]],
]);
$kept = App\Models\Order::findOrFail($forged['id']);
echo "forged order {$status}: {$kept->email} {$kept->status} ", $kept->number !== 'JM-9999' && (float) $kept->total === (float) $drinks[0]->price ? 'numbered and priced by Laravel' : "kept {$kept->number} {$kept->total}", PHP_EOL;

// Each sees their own.
[, $mine] = $call('GET', '/api/orders?perPage=100');
echo 'amara sees: ', count($mine['data']), ' ', array_diff(array_unique(array_column($mine['data'], 'email')), ['amara@example.com']) === [] ? 'only her own' : 'others too', PHP_EOL;
$as('bo@example.com');
[, $his] = $call('GET', '/api/orders?perPage=100');
echo 'bo sees: ', count($his['data']), PHP_EOL;
[$status] = $call('GET', "/api/orders/{$order['id']}");
echo "bo opens amara's order: {$status}", PHP_EOL;
[$status] = $call('PATCH', "/api/orders/{$order['id']}", ['status' => 'completed']);
echo "bo changes it: {$status}", PHP_EOL;
$as('amara@example.com');
[$status] = $call('PATCH', "/api/orders/{$order['id']}", ['status' => 'completed']);
echo "amara changes her own status: {$status}", PHP_EOL;
echo 'still ', App\Models\Order::findOrFail($order['id'])->status, PHP_EOL;

// The bar: every order, and the status moves on.
$as('mercy@example.com');
[, $all] = $call('GET', '/api/orders?perPage=100');
echo 'mercy sees: ', $all['meta']['total'], ' of ', App\Models\Order::count(), PHP_EOL;
[$status, $moved] = $call('PATCH', "/api/orders/{$order['id']}", ['status' => 'accepted']);
echo "mercy accepts it: {$status} {$moved['status']}", PHP_EOL;
$as('amara@example.com');
[, $again] = $call('GET', "/api/orders/{$order['id']}");
echo "amara sees it {$again['status']}", PHP_EOL;

// A drink that is out is not on the shelf: the customer's list can say so with a filter.
$drinks[0]->update(['available' => false]);
[, $shelf] = $call('GET', '/api/beverages?perPage=100&filter[available]=true');
echo 'on the shelf: ', in_array($drinks[0]->id, array_column($shelf['data'], 'id'), true) ? 'the one that is out too' : 'only what is available', PHP_EOL;
