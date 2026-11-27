<?php

// Several processes writing to the activity log at the same moment, as several workers on a
// real server do: every entry sealed in one unbroken chain, at its own place. A person's
// changes made at the same moment on several workers may start a run each, never more.
// PHPUnit runs in one process, so it can't show this. Run from apps/api, against a migrated
// database: php tests/activity-at-once.php

use App\Models\Category;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Activity\Activity;
use Nevela\Laravel\Activity\Chain;

$processes = 6;
$each = 20;

require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

// Whatever goes wrong is a failure. Left uncaught, Laravel's handler shows it and CI sees success.
set_exception_handler(function (Throwable $e): void {
    fwrite(STDERR, get_class($e).': '.$e->getMessage().PHP_EOL);
    exit(1);
});

// One of them: wait for the moment they all start at, then one create at a time, each written
// to the log as a request's end writes it.
if (($argv[1] ?? '') === 'write') {
    Auth::login(User::query()->findOrFail($argv[3]));
    time_sleep_until((float) $argv[2]);
    foreach (range(1, $each) as $i) {
        $name = 'At once '.Str::random(10);
        Category::create(['name' => $name, 'slug' => Str::slug($name)]);
        Activity::flush();
    }
    exit(0);
}

// Two people, three processes each: so their entries interleave in the chain.
$people = [];
foreach (['Ada', 'Ben'] as $name) {
    $email = strtolower($name).'-at-once-'.Str::random(6).'@example.com';
    $user = User::query()->forceCreate(['name' => $name, 'email' => $email, 'password' => bcrypt(Str::random(20))]);
    Access::grant($user, 'ADMIN');
    $people[] = (string) $user->getKey();
}
$before = (int) DB::table(Chain::HEAD)->where('id', 1)->value('seq');

$start = microtime(true) + 3;
$running = [];
foreach (range(1, $processes) as $i) {
    $running[] = proc_open([PHP_BINARY, __FILE__, 'write', (string) $start, $people[$i % 2]], [], $pipes);
}
$failed = 0;
foreach ($running as $process) {
    $failed += proc_close($process) === 0 ? 0 : 1;
}

$entries = DB::table(Activity::TABLE)->whereIn('user_id', $people)->where('resource', 'Category')->whereNotNull('seq')->get(['user_id', 'group_id', 'seq']);
$head = (int) DB::table(Chain::HEAD)->where('id', 1)->value('seq');
$groups = $entries->groupBy('user_id')->map(fn ($mine) => $mine->pluck('group_id')->unique()->count());
$check = Chain::verify();

Category::query()->where('name', 'like', 'At once %')->forceDelete();

$written = $entries->count();
echo "{$written} of ".($processes * $each).' entries sealed, the head moved '.($head - $before).", {$failed} processes failed, chain: {$check['message']}".PHP_EOL;
echo 'runs per person: '.$groups->values()->implode(', ').PHP_EOL;

// Every entry in the chain at its own place, and the chain whole. Each person's changes, all
// within the two minutes that join a run, are at most one run per process that wrote them.
$most = intdiv($processes, 2);
exit($failed === 0 && $written === $processes * $each && $head - $before === $written && $check['ok'] && $groups->every(fn (int $runs) => $runs <= $most) ? 0 : 1);
