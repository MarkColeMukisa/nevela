<?php

// The tutorial's action, run on a lead: what it says and what it leaves. Run from apps/api.
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$lead = App\Models\Contact::where('status', 'lead')->firstOrFail();
echo (new App\Nevela\Actions\Contact\MarkCustomer)->handle($lead, []), PHP_EOL;
echo $lead->refresh()->status, ' ', $lead->last_contacted_on?->format('Y-m-d'), PHP_EOL;
