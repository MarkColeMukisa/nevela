<?php

// What the tutorial does by hand in the dashboard, for CI, which has no one to click. Run
// from apps/api:
//
//   by-hand.php role TEACHER courses.view students.view …   a role, as on the Roles screen
//   by-hand.php teacher "Grace Nakitende" grace@… 2        a teacher, who then teaches the first two courses
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

[, $what] = $argv;
if ($what === 'role') {
    Nevela\Laravel\Models\Role::query()->create(['name' => $argv[2], 'description' => null, 'grants' => array_slice($argv, 3), 'is_system' => false]);
    echo "Role {$argv[2]}", PHP_EOL;
} elseif ($what === 'teacher') {
    $teacher = App\Models\Teacher::create(['name' => $argv[2], 'email' => $argv[3]]);
    App\Models\Course::query()->orderBy('code')->limit((int) $argv[4])->update(['teacher_id' => $teacher->id]);
    echo "{$teacher->name} teaches ", App\Models\Course::where('teacher_id', $teacher->id)->pluck('title')->implode(', '), PHP_EOL;
} else {
    fwrite(STDERR, "role or teacher\n");
    exit(1);
}
