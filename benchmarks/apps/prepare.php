<?php

/*
 * The changes every app here gets, made the same way, so none is tuned where another
 * isn't. Run in the image, after the app's own build.sh:
 *
 *   php /bench/prepare.php laravel|nevela [app folder, /app]
 */

$app = $argv[1] ?? '';
$root = rtrim($argv[2] ?? '/app', '/');
if (! in_array($app, ['laravel', 'nevela'], true)) {
    fwrite(STDERR, "usage: php prepare.php laravel|nevela\n");
    exit(2);
}

/** Replace text that must be in the file exactly once, or stop: a skeleton that changed is not guessed at. */
function swap(string $file, string $old, string $new): void
{
    $text = file_get_contents($file);
    if (substr_count($text, $old) !== 1) {
        fwrite(STDERR, "{$file}: expected to find this exactly once:\n{$old}\n");
        exit(1);
    }
    file_put_contents($file, str_replace($old, $new, $text));
}

// Each PHP-FPM worker keeps its connection to Postgres between requests, as a PHP app in
// production usually does (or a pooler does for it), rather than connecting on every one.
swap($root.'/config/database.php',
    "            'sslmode' => env('DB_SSLMODE', 'prefer'),\n",
    "            'sslmode' => env('DB_SSLMODE', 'prefer'),\n            'options' => [PDO::ATTR_PERSISTENT => (bool) env('DB_PERSISTENT', false)],\n");

// Sanctum's tokens, as create-nevela adds them to a new app's User.
swap($root.'/app/Models/User.php', "use Illuminate\\Notifications\\Notifiable;\n", "use Illuminate\\Notifications\\Notifiable;\nuse Laravel\\Sanctum\\HasApiTokens;\n");
swap($root.'/app/Models/User.php', 'use HasFactory, Notifiable;', 'use HasApiTokens, HasFactory, Notifiable;');

// The plain app's routes/api.php. Nevela loads its own routes.
if ($app === 'laravel') {
    swap($root.'/bootstrap/app.php', "        web: __DIR__.'/../routes/web.php',\n", "        web: __DIR__.'/../routes/web.php',\n        api: __DIR__.'/../routes/api.php',\n");
}

// A token for run.sh to sign in with. In Nevela the account is made first by
// `nevela:user`, which makes the first account the administrator.
file_put_contents($root.'/routes/console.php', <<<'PHP'

Artisan::command('bench:token', function () {
    $user = \App\Models\User::query()->firstOrCreate(
        ['email' => 'bench@example.com'],
        ['name' => 'Bench', 'password' => \Illuminate\Support\Str::random(40)],
    );
    $this->line($user->createToken('bench')->plainTextToken);
})->purpose('A sign-in token for the benchmark');

PHP, FILE_APPEND);

echo "prepared {$app}\n";
