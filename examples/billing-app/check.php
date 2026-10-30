<?php

// The tutorial's billing app, checked over its own API: a client's phone number, a project's
// billing cycle and gallery, numbered invoices in shillings, and a payment's method. Run from apps/api.
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

// A client's phone, written the way people write one in Uganda.
$client = ['name' => 'Amina Ssebuwa', 'company' => 'Ssebuwa Traders', 'email' => 'amina@example.com', 'address' => 'Plot 12, Kampala Road'];
[, $body] = $call('POST', '/api/clients', $client + ['phone' => '0772 123456']);
echo 'phone kept as: ', $body['phone'] ?? json_encode($body), PHP_EOL;
[$status] = $call('POST', '/api/clients', $client + ['phone' => '+254 712 345678']);
echo 'a Kenyan number: ', $status === 422 ? 'refused' : "taken ({$status})", PHP_EOL;

// A billing cycle belongs to a recurring project, and means nothing on a one-off.
$project = ['clientId' => $body['id'], 'name' => 'Stock system', 'brief' => '<p>Stock and sales for two shops.</p>', 'amount' => 4500000, 'starts' => '2026-11-01'];
[$status, $refused] = $call('POST', '/api/projects', $project + ['kind' => 'recurring']);
echo 'recurring without a cycle: ', $refused['issues'][0]['message'] ?? "taken ({$status})", PHP_EOL;
[, $oneOff] = $call('POST', '/api/projects', $project + ['kind' => 'one_off', 'cycle' => 'monthly']);
echo 'one-off with a cycle: ', array_key_exists('cycle', $oneOff) && $oneOff['cycle'] === null ? 'kept empty' : json_encode($oneOff), PHP_EOL;
echo 'seeded one-offs with a cycle: ', App\Models\Project::where('kind', 'one_off')->whereNotNull('cycle')->count(), PHP_EOL;
echo 'seeded recurring without one: ', App\Models\Project::where('kind', 'recurring')->whereNull('cycle')->count(), PHP_EOL;
$pictured = App\Models\Project::whereNotNull('gallery')->first();
[, $shown] = $pictured === null ? [0, []] : $call('GET', "/api/projects/{$pictured->id}");
echo 'seeded projects with pictures: ', count($shown['galleryFiles'] ?? []) > 0 && count($shown['galleryFiles']) === count($shown['gallery']) ? 'yes' : 'no', PHP_EOL;

// Invoices: numbered, in shillings, and a list of 25,000 that still opens on its first page.
echo 'first invoice: ', App\Models\Invoice::orderBy('number')->value('number'), PHP_EOL;
[, $list] = $call('GET', '/api/invoices?perPage=25');
echo 'invoices in the list: ', $list['meta']['total'] ?? json_encode($list), PHP_EOL;
$fractions = App\Models\Invoice::query()->pluck('amount')->filter(fn ($amount) => fmod((float) $amount, 1000.0) !== 0.0)->count();
echo 'amounts in whole shillings: ', $fractions === 0 ? 'yes' : "no ({$fractions})", PHP_EOL;

// A payment's method, as it reads.
echo 'mobile money is called: ', Nevela\Laravel\Nevela::resource('Payment')->fields['method']->optionLabel('mobile'), PHP_EOL;
