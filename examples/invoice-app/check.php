<?php

// The tutorial's invoice app, checked over its own API: an invoice's number, its lines' prices,
// its status and terms, and the due date added after its first records. Run from apps/api.
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$http = $app->make(Illuminate\Contracts\Http\Kernel::class);
$call = function (string $method, string $uri, ?array $body = null) use ($http): array {
    $request = Illuminate\Http\Request::create($uri, $method, server: ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], content: $body === null ? null : json_encode($body));
    $response = $http->handle($request);

    return [$response->getStatusCode(), json_decode((string) $response->getContent(), true)];
};
Laravel\Sanctum\Sanctum::actingAs(App\Models\User::where('email', 'admin@example.com')->firstOrFail());

// Each seeded line has its product's price, and the invoices are from before the due date.
$wrong = App\Models\InvoiceItem::with('product')->get()->filter(fn ($item) => (float) $item->price !== (float) $item->product->price)->count();
echo "seeded prices are the products': ", $wrong === 0 ? 'yes' : "no ({$wrong})", PHP_EOL;
echo 'seeded invoices without a due date: ', App\Models\Invoice::whereNull('due_date')->count(), PHP_EOL;

$customer = App\Models\Customer::query()->firstOrFail();
$products = App\Models\Product::query()->take(2)->get();
$invoice = ['customerId' => $customer->id, 'items' => [
    ['productId' => $products[0]->id, 'quantity' => 2],
    // A price sent is not the price: it comes from the product.
    ['productId' => $products[1]->id, 'quantity' => 1, 'price' => 1],
]];

[$status] = $call('POST', '/api/invoices', $invoice);
echo 'without a due date: ', $status === 422 ? 'refused' : "taken ({$status})", PHP_EOL;

[$status, $made] = $call('POST', '/api/invoices', $invoice + ['dueDate' => '2026-12-01']);
echo 'invoice ', $status, ' ', $made['number'] ?? json_encode($made), ' ', $made['status'] ?? '', ' ', $made['terms'] ?? '', PHP_EOL;
$prices = array_column($made['items'] ?? [], 'price');
echo 'prices from the products: ', array_map('floatval', $prices) === [(float) $products[0]->price, (float) $products[1]->price] ? 'yes' : json_encode($prices), PHP_EOL;
echo 'no total is stored: ', array_key_exists('total', $made) ? 'no' : 'yes', PHP_EOL;

// One from before the due date can be changed without it, and is asked for it when edited whole.
$earlier = App\Models\Invoice::whereNull('due_date')->firstOrFail();
[, $paid] = $call('PATCH', "/api/invoices/{$earlier->id}", ['status' => 'paid']);
echo 'an earlier invoice can still be marked paid: ', $paid['status'] ?? json_encode($paid), PHP_EOL;

[$status] = $call('POST', '/api/invoices', ['status' => 'overdue', 'dueDate' => '2026-12-01'] + $invoice);
echo "a status it can't have: ", $status === 422 ? 'refused' : "taken ({$status})", PHP_EOL;

echo 'net30 is called: ', Nevela\Laravel\Nevela::resource('Invoice')->fields['terms']->optionLabel('net30'), PHP_EOL;

$numbers = App\Models\Invoice::query()->pluck('number');
echo 'each its own number: ', $numbers->count() === $numbers->unique()->count() ? 'yes' : 'no', PHP_EOL;
