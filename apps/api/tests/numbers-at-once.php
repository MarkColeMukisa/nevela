<?php

// Several processes making orders at the same moment, as several people on a real server
// do: every order saved, and no number given twice. PHPUnit runs in one process, so it can't
// show this. Run from apps/api, against a migrated database: php tests/numbers-at-once.php

use App\Models\Order;
use Illuminate\Contracts\Console\Kernel;

$processes = 6;
$each = 25;

require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

// One of them: wait for the moment they all start at, make the orders, say how it went.
if (($argv[1] ?? '') === 'make') {
    time_sleep_until((float) $argv[2]);
    foreach (range(1, $each) as $i) {
        try {
            $order = Order::create(['customer' => 'At once', 'status' => 'pending']);
            echo $order->getKey(), ' ', $order->number, PHP_EOL;
        } catch (Throwable $e) {
            echo 'refused ', strtok($e->getMessage(), "\n"), PHP_EOL;
        }
    }
    exit(0);
}

$start = microtime(true) + 3;
$running = [];
foreach (range(1, $processes) as $i) {
    $pipes = [];
    $running[] = [proc_open([PHP_BINARY, __FILE__, 'make', (string) $start], [1 => ['pipe', 'w']], $pipes), $pipes[1]];
}
$lines = [];
foreach ($running as [$process, $output]) {
    array_push($lines, ...array_filter(explode(PHP_EOL, (string) stream_get_contents($output))));
    proc_close($process);
}

$refused = array_values(array_filter($lines, fn (string $line) => str_starts_with($line, 'refused')));
$made = array_values(array_diff($lines, $refused));
$numbers = array_map(fn (string $line) => explode(' ', $line)[1], $made);
$ids = array_map(fn (string $line) => explode(' ', $line)[0], $made);
Order::query()->whereIn('id', $ids)->forceDelete();

echo count($made).' of '.($processes * $each).' orders saved, '.count(array_unique($numbers)).' different numbers, '.count($refused).' refused'.PHP_EOL;
if ($refused !== []) {
    echo $refused[0].PHP_EOL;
}

exit(count($made) === $processes * $each && count(array_unique($numbers)) === count($made) ? 0 : 1);
