<?php

// A seed killed partway, as Ctrl+C does, and the same command run again: what it saved stays,
// and it carries on to exactly the number asked for, with no number given twice. PHPUnit runs in
// one process, so it can't show this. Run from apps/api, against a migrated database:
// php tests/seed-resumes.php

use App\Models\Order;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

// Whatever goes wrong is a failure. Left uncaught, Laravel's handler shows it and CI sees success.
set_exception_handler(function (Throwable $e): void {
    fwrite(STDERR, get_class($e).': '.$e->getMessage().PHP_EOL);
    exit(1);
});

$before = Order::query()->withTrashed()->pluck('id')->all();
$new = fn () => DB::table('orders')->when($before !== [], fn ($query) => $query->whereNotIn('id', $before));
$listed = fn () => Order::query()->count();
$target = $listed() + 40000;
$command = [PHP_BINARY, 'artisan', 'nevela:seed', 'Order', "--count={$target}"];
$there = $listed();

$pipes = [];
$seed = proc_open($command, [1 => ['file', 'php://temp', 'w'], 2 => ['file', 'php://temp', 'w']], $pipes);
// Long enough for it to have saved something, and not long enough for it to have finished.
$deadline = microtime(true) + 120;
while ($listed() < $there + 5000 && proc_get_status($seed)['running'] && microtime(true) < $deadline) {
    usleep(100000);
}
$stillRunning = proc_get_status($seed)['running'];
proc_terminate($seed, 9);
proc_close($seed);
DB::disconnect();

$killedAt = $listed();
echo 'killed at ', number_format($killedAt - $there), ' of 40,000', $stillRunning ? '' : ' (it had already stopped)', PHP_EOL;

passthru(implode(' ', array_map('escapeshellarg', $command)).' > '.(PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null').' 2>&1', $status);
$after = $listed();
$numbers = $new()->pluck('number');
$unique = $numbers->unique()->count();
echo 'run again: exit ', $status, ', ', number_format($after - $there), ' of 40,000, ', number_format($unique), ' different numbers', PHP_EOL;

// And once more, which has nothing to do.
passthru(implode(' ', array_map('escapeshellarg', $command)).' > '.(PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null').' 2>&1', $again);
$still = $listed();
echo 'run a third time: exit ', $again, ', ', number_format($still - $there), ' of 40,000', PHP_EOL;

$kept = $killedAt - $there;
$new()->delete();

exit($stillRunning && $kept >= 5000 && $kept < 40000 && $status === 0 && $after === $target && $unique === $numbers->count() && $again === 0 && $still === $target ? 0 : 1);
