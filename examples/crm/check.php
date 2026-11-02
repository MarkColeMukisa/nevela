<?php

// The tutorial's CRM, checked over its own API: what is kept of what a person types, and what
// is refused. Run from apps/api.
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

// A company as someone pastes it: a whole address for its domain, a short colour, no country.
$company = ['name' => 'Nakato Traders', 'website' => 'https://example.com', 'domain' => 'https://Example.COM/about', 'brand' => '#ABC', 'industry' => 'tech', 'profile' => ['founded' => 2019]];
[$status, $made] = $call('POST', '/api/companies', $company);
$industry = Nevela\Laravel\Nevela::resource('Company')->fields['industry']->optionLabel($made['industry'] ?? '');
echo 'company ', $status, ' ', $made['domain'] ?? json_encode($made), ' ', $made['brand'] ?? '', ' ', $made['country'] ?? '', ' ', $industry, PHP_EOL;
[$status] = $call('POST', '/api/companies', ['domain' => 'EXAMPLE.com'] + $company);
echo 'the same domain written another way: ', $status === 422 ? 'refused' : "taken ({$status})", PHP_EOL;

// A contact as a rep in Kampala types one.
$contact = ['firstName' => 'Ada', 'lastName' => 'Nakato', 'companyId' => $made['id'], 'rating' => 4, 'bestTime' => '9:05', 'winChance' => 62.5, 'stage' => 'lead'];
[$status, $ada] = $call('POST', '/api/contacts', $contact + ['email' => 'Ada.Nakato@Example.COM', 'phone' => '0772 123456']);
echo 'contact ', $status, ' ', $ada['email'] ?? json_encode($ada), ' ', $ada['phone'] ?? '', ' ', $ada['bestTime'] ?? '', ' ', $ada['winChance'] ?? '', PHP_EOL;
[$status] = $call('POST', '/api/contacts', $contact + ['email' => 'ADA.NAKATO@EXAMPLE.COM', 'phone' => '0772 999999']);
echo 'the same email in capitals: ', $status === 422 ? 'refused' : "taken ({$status})", PHP_EOL;
[$status] = $call('POST', '/api/contacts', $contact + ['email' => 'other@example.com', 'phone' => '+256 772 123 456']);
echo 'the same phone written another way: ', $status === 422 ? 'refused' : "taken ({$status})", PHP_EOL;
[, $abroad] = $call('POST', '/api/contacts', $contact + ['email' => 'abroad@example.com', 'phone' => '+44 7400 123456']);
echo 'a number from abroad: ', $abroad['phone'] ?? json_encode($abroad), PHP_EOL;
[, $short] = $call('POST', '/api/contacts', $contact + ['email' => 'short@example.com', 'phone' => '+256 12']);
echo 'a number too short: ', $short['issues'][0]['message'] ?? json_encode($short), PHP_EOL;
[$status] = $call('POST', '/api/contacts', ['rating' => 6] + $contact + ['email' => 'six@example.com', 'phone' => '0772 555555']);
echo 'a rating of six: ', $status === 422 ? 'refused' : "taken ({$status})", PHP_EOL;

// What the seeder made: real numbers, and an address each.
$phones = App\Models\Contact::query()->inRandomOrder()->limit(2000)->pluck('phone');
$real = $phones->filter(fn ($phone) => Nevela\Laravel\Support\Phone::normalise((string) $phone) === $phone)->count();
echo 'seeded phones that are real: ', $real === $phones->count() ? 'all' : "{$real} of {$phones->count()}", PHP_EOL;
$emails = Illuminate\Support\Facades\DB::table('contacts')->count();
echo 'seeded emails each their own: ', Illuminate\Support\Facades\DB::table('contacts')->distinct()->count('email') === $emails ? 'yes' : 'no', PHP_EOL;
