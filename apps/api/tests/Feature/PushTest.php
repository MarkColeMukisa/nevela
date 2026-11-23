<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Nevela\Laravel\Auth\Sessions;
use Nevela\Laravel\Notices\Notice;
use Nevela\Laravel\Notices\Notices;
use Nevela\Laravel\Push\Push;
use Nevela\Laravel\Support\SchemaFacts;
use Tests\TestCase;

/**
 * Push notifications: a phone registers when someone signs in on it, every bell notice goes to
 * it as a push, and it hears nothing more once that sign-in ends, however it ends.
 */
class PushTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct horse battery staple';

    private const PHONE = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

    /** What Expo answers a send with. Http::fake keeps its first stub for an address, so the stub reads this. */
    private \Closure $expo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        // A push is sent after the answer; here, at once.
        $this->withoutDefer();
        Cache::flush();
        $this->expo = fn () => Http::response(['data' => [['status' => 'ok', 'id' => 'ticket-1']]]);
        Http::fake([
            Push::SEND => fn () => ($this->expo)(),
            Push::RECEIPTS => Http::response(['data' => ['ticket-1' => ['status' => 'error', 'message' => 'bad key', 'details' => ['error' => 'InvalidCredentials']]]]),
        ]);
    }

    private function user(string $email = 'ada@example.com'): User
    {
        return User::factory()->create(['email' => $email, 'password' => Hash::make(self::PASSWORD)]);
    }

    /** Sign in as the phone app does: a session of its own. @return array{token: string, id: string, headers: array<string, string>} */
    private function signIn(User $user): array
    {
        $answer = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => self::PASSWORD])->assertCreated()->json();
        $this->app['auth']->forgetGuards();

        return ['token' => $answer['token'], 'id' => (string) Sessions::of(DB::table('personal_access_tokens')->where('id', explode('|', $answer['token'])[0])->first()), 'headers' => ['Authorization' => "Bearer {$answer['token']}"]];
    }

    private function register(array $signedIn, string $token = self::PHONE): void
    {
        $this->putJson('/api/_nevela/push-tokens', ['token' => $token, 'platform' => 'android'], $signedIn['headers'])->assertOk()->assertJsonPath('registered', true);
        $this->app['auth']->forgetGuards();
    }

    public function test_a_phone_registers_with_its_sign_in_and_a_bell_notice_reaches_it(): void
    {
        $ada = $this->user();
        $session = $this->signIn($ada);
        $this->register($session);
        $this->assertSame($session['id'], DB::table(Push::TABLE)->where('token', self::PHONE)->value('session_id'));

        Notices::send($ada, new Notice('Your order JM-0016 is ready', 'Collect it at the counter', '/dashboard/orders/16'));

        Http::assertSent(fn (Request $request) => $request->url() === Push::SEND
            && $request[0]['to'] === self::PHONE
            && $request[0]['title'] === 'Your order JM-0016 is ready'
            && $request[0]['data'] === ['url' => '/dashboard/orders/16']
            && $request[0]['channelId'] === 'default');
    }

    public function test_only_a_real_token_is_taken_and_the_last_to_sign_in_on_a_phone_owns_it(): void
    {
        $ada = $this->user();
        $bo = $this->user('bo@example.com');
        $this->putJson('/api/_nevela/push-tokens', ['token' => 'not-a-token'], $this->signIn($ada)['headers'])->assertStatus(422);
        $this->app['auth']->forgetGuards();

        $this->register($this->signIn($ada));
        $this->register($this->signIn($bo));
        $this->assertSame([(string) $bo->id], DB::table(Push::TABLE)->pluck('user_id')->all());

        // Nobody else can stop someone's pushes, knowing the token.
        $this->deleteJson('/api/_nevela/push-tokens/'.rawurlencode(self::PHONE), [], $this->signIn($ada)['headers'])->assertOk();
        $this->assertSame(1, DB::table(Push::TABLE)->count());
    }

    public function test_signing_out_and_every_other_end_of_a_sign_in_forgets_the_phone(): void
    {
        $ada = $this->user();

        // Signed out on the phone.
        $session = $this->signIn($ada);
        $this->register($session);
        $this->deleteJson('/api/auth/token', [], $session['headers'])->assertNoContent();
        $this->assertSame(0, DB::table(Push::TABLE)->count());

        // Revoked from another device's Devices screen.
        $phone = $this->signIn($ada);
        $this->register($phone);
        $laptop = $this->signIn($ada);
        $this->deleteJson("/api/auth/sessions/{$phone['id']}", [], $laptop['headers'])->assertNoContent();
        $this->assertSame(0, DB::table(Push::TABLE)->count());

        // A sign-in that lapsed and was pruned.
        $old = $this->signIn($ada);
        $this->register($old, 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]');
        DB::table(Sessions::TABLE)->where('id', $old['id'])->delete();
        Sessions::prune();
        $this->assertSame(0, DB::table(Push::TABLE)->count());

        // An account removed for good.
        $this->register($this->signIn($ada));
        \Nevela\Laravel\Access\ClosedAccounts::remove($ada);
        $this->assertSame(0, DB::table(Push::TABLE)->count());

        // With no phone, nothing is asked of Expo.
        Http::assertNothingSent();
    }

    public function test_a_phone_expo_says_is_gone_is_forgotten(): void
    {
        $this->expo = fn () => Http::response(['data' => [['status' => 'error', 'message' => 'not registered', 'details' => ['error' => 'DeviceNotRegistered']]]]);
        $ada = $this->user();
        $this->register($this->signIn($ada));

        $tickets = Push::send([$ada->id], 'Hello');

        $this->assertSame('DeviceNotRegistered', $tickets[0]['details']['error']);
        $this->assertSame(0, DB::table(Push::TABLE)->count());
    }

    public function test_expo_down_or_no_table_never_gets_in_the_way(): void
    {
        $ada = $this->user();
        $this->register($this->signIn($ada));
        $this->expo = fn () => Http::response('down', 503);
        $this->assertSame([], Push::send([$ada->id], 'Hello'));

        // Before `migrate` on an app that just upgraded: nothing sent, nothing thrown, nothing reported.
        $this->withoutExceptionHandling();
        Schema::drop(Push::TABLE);
        SchemaFacts::forget();
        $this->assertSame([], Push::send([$ada->id], 'Hello'));
        $this->assertSame(1, Notices::send($ada, new Notice('Still in the bell')));
    }

    public function test_the_test_command_shows_the_tickets_and_the_receipts(): void
    {
        $ada = $this->user();
        $this->artisan('nevela:push', ['account' => 'ada@example.com', '--wait' => 0])->expectsOutputToContain('no phone registered')->assertFailed();

        $this->register($this->signIn($ada));
        $this->artisan('nevela:push', ['account' => 'ada@example.com', '--wait' => 0])
            ->expectsOutputToContain('taken by Expo')
            ->expectsOutputToContain('InvalidCredentials')
            ->assertFailed();
    }
}
