<?php

// The tutorial's school, checked: what Grace sees, a student signing up and confirming, and
// a drop told to the teacher. Run from apps/api.
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$http = $app->make(Illuminate\Contracts\Http\Kernel::class);
$call = function (string $method, string $uri, ?array $body = null) use ($http): array {
    $request = Illuminate\Http\Request::create($uri, $method, server: ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'], content: $body === null ? null : json_encode($body));
    $response = $http->handle($request);

    return [$response->getStatusCode(), json_decode((string) $response->getContent(), true)];
};
$bell = fn (App\Models\User $user) => Illuminate\Support\Facades\DB::table('nevela_notifications')->where('user_id', (string) $user->getKey())->pluck('title')->all();
$admin = App\Models\User::where('email', 'admin@example.com')->firstOrFail();
$grace = App\Models\User::where('email', 'grace@example.com')->firstOrFail();

// Seeded: three hundred enrolments, no student twice in a course.
$shared = Illuminate\Support\Facades\DB::table('enrolments')->select('student_id', 'course_id')->groupBy('student_id', 'course_id')->havingRaw('count(*) > 1')->get()->count();
echo 'seeded pairs apart: ', $shared === 0 && App\Models\Enrolment::count() === 300 ? 'yes' : "no ({$shared})", PHP_EOL;

// A visitor signs up, and follows the link the email has in it.
[, $form] = $call('GET', '/api/public/_nevela/form/students');
sleep((int) $form['minSeconds']);
[$status] = $call('POST', '/api/public/students', ['name' => 'Amina Ssebuwa', 'email' => 'amina@example.com', '_form' => $form['token']]);
$amina = App\Models\Student::where('email', 'amina@example.com')->firstOrFail();
$waiting = ! $amina->isConfirmed();
$descriptor = Nevela\Laravel\Nevela::resource('Student');
$call('POST', "/api/public/_nevela/confirm/students/{$amina->id}/".Nevela\Laravel\Forms\Confirmation::hash($descriptor, $amina->id, $amina->email));
echo "sign-up {$status}, confirmed after the link: ", $waiting && $amina->refresh()->isConfirmed() ? 'yes' : 'no', PHP_EOL;
echo 'admin told of the sign-up: ', in_array('Student confirmed: Amina Ssebuwa', $bell($admin), true) ? 'yes' : 'no', PHP_EOL;
echo "grace told of the sign-up: ", in_array('Student confirmed: Amina Ssebuwa', $bell($grace), true) ? 'yes' : 'no', PHP_EOL;

// The administrator: a student is in a course once.
Laravel\Sanctum\Sanctum::actingAs($admin);
$taken = App\Models\Enrolment::query()->firstOrFail();
[$status, $body] = $call('POST', '/api/enrolments', ['studentId' => $taken->student_id, 'courseId' => $taken->course_id]);
echo 'second enrolment refused: ', $status === 422 && ($body['issues'][0]['message'] ?? '') === 'There is already an enrolment with this student and course.' ? 'yes' : "no ({$status})", PHP_EOL;

// Grace: her two courses, the enrolments in them, and nothing of anyone else's.
$hers = App\Models\Course::whereHas('teacher', fn ($teacher) => $teacher->where('email', 'grace@example.com'))->pluck('id')->all();
$dropping = App\Models\Enrolment::whereIn('course_id', $hers)->where('status', '!=', 'dropped')->firstOrFail();
$call('PATCH', "/api/enrolments/{$dropping->id}", ['status' => 'dropped']);
Laravel\Sanctum\Sanctum::actingAs($grace);
[, $courses] = $call('GET', '/api/courses');
echo "grace's courses: {$courses['meta']['total']} of ", App\Models\Course::count(), PHP_EOL;
[, $enrolments] = $call('GET', '/api/enrolments?perPage=100');
$inHers = array_diff(array_column($enrolments['data'], 'courseId'), $hers) === [] && $enrolments['meta']['total'] === App\Models\Enrolment::whereIn('course_id', $hers)->count();
echo "grace's enrolments are in her courses: ", $inHers ? 'yes' : 'no', PHP_EOL;
[$status] = $call('GET', '/api/courses/'.App\Models\Course::whereNotIn('id', $hers)->value('id'));
echo "another course: {$status}", PHP_EOL;
$dropped = "{$dropping->student->name} dropped {$dropping->course->title}";
echo 'grace told of the drop: ', in_array($dropped, $bell($grace), true) ? 'yes' : 'no', PHP_EOL;
