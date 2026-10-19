<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Auth\Sessions;
use Tests\TestCase;

/**
 * Sign-ins that end, as Grit's do: 15-minute access tokens, a refresh token swapped on
 * every use, a 7-day idle limit and a 30-day one however busy.
 *
 * Real tokens throughout, never Sanctum::actingAs, and the guard is forgotten before
 * every request: Laravel's test client remembers who was signed in from the request
 * before, and would let a token through that ought to be refused.
 */
class SessionsTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct horse battery staple';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        config(['nevela.auth.session' => ['access' => 15, 'idle' => 60 * 24 * 7, 'absolute' => 60 * 24 * 30, 'reuse_seconds' => 60]]);
    }

    private function user(): User
    {
        $user = User::factory()->create(['email' => 'ada@example.com', 'password' => Hash::make(self::PASSWORD)]);
        Access::grant($user, 'ADMIN');

        return $user;
    }

    /** @return array{token: string, refreshToken: string, expiresAt: string, refreshExpiresAt: string|null} */
    private function signIn(): array
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/auth/token', ['email' => 'ada@example.com', 'password' => self::PASSWORD])->assertCreated()->json();
    }

    private function me(string $token): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->getJson('/api/auth/me', ['Authorization' => "Bearer {$token}"]);
    }

    private function refresh(string $refreshToken): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/auth/refresh', ['refreshToken' => $refreshToken]);
    }

    public function test_a_sign_in_is_a_short_token_and_a_refresh_token(): void
    {
        $this->user();
        $pair = $this->signIn();

        $this->assertNotEmpty($pair['refreshToken']);
        $this->assertEqualsWithDelta(now()->addMinutes(15)->timestamp, strtotime($pair['expiresAt']), 5);
        // The refresh token lasts as long as the idle limit, and no longer than the absolute one.
        $this->assertEqualsWithDelta(now()->addDays(7)->timestamp, strtotime($pair['refreshExpiresAt']), 5);
        $this->me($pair['token'])->assertOk()->assertJsonPath('user.email', 'ada@example.com');

        // A copy of the access token stops working after 15 minutes.
        $this->travel(16)->minutes();
        $this->me($pair['token'])->assertUnauthorized();
    }

    public function test_refreshing_swaps_the_refresh_token_and_keeps_someone_working_signed_in(): void
    {
        $this->user();
        $pair = $this->signIn();

        // A working day of refreshes, every 14 minutes.
        for ($i = 0; $i < 30; $i++) {
            $this->travel(14)->minutes();
            $next = $this->refresh($pair['refreshToken'])->assertOk()->json();
            $this->assertNotSame($pair['refreshToken'], $next['refreshToken']);
            $this->me($next['token'])->assertOk();
            $pair = $next;
        }
        $this->assertSame(1, DB::table(Sessions::TABLE)->count(), 'one device throughout');
    }

    public function test_a_refresh_token_used_twice_ends_the_sign_in_on_both(): void
    {
        $this->user();
        $stolen = $this->signIn();

        // The owner refreshes; a minute and more later, the copy is tried.
        $owners = $this->refresh($stolen['refreshToken'])->assertOk()->json();
        $this->travel(2)->minutes();
        $this->refresh($stolen['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_REPLAYED');

        // Both are out: the owner's new refresh token, and the access token it was given.
        $this->refresh($owners['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_REVOKED');
        $this->me($owners['token'])->assertUnauthorized();
    }

    public function test_a_copy_swapped_many_times_since_is_found_out_when_the_owner_comes_back(): void
    {
        $this->user();
        $owners = $this->signIn();

        // The copy is taken and refreshed, again and again, while the owner is away.
        $thiefs = $owners;
        for ($i = 0; $i < 3; $i++) {
            $this->travel(14)->minutes();
            $thiefs = $this->refresh($thiefs['refreshToken'])->assertOk()->json();
        }

        // The owner's token is three swaps old: the sign-in ends, the thief's with it.
        $this->refresh($owners['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_REPLAYED');
        $this->refresh($thiefs['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_REVOKED');
        $this->me($thiefs['token'])->assertUnauthorized();
    }

    public function test_spent_refresh_tokens_go_with_their_sign_in(): void
    {
        $user = $this->user();
        $pair = $this->signIn();
        $this->refresh($pair['refreshToken'])->assertOk();
        $this->assertSame(1, DB::table(Sessions::SPENT)->count());

        // Pruned a day after the sign-in ends.
        $this->travel(9)->days();
        Sessions::prune();
        $this->assertSame(0, DB::table(Sessions::TABLE)->count());
        $this->assertSame(0, DB::table(Sessions::SPENT)->count());

        // And at once when the account is deleted.
        $pair = $this->signIn();
        $this->refresh($pair['refreshToken'])->assertOk();
        \Nevela\Laravel\Access\ClosedAccounts::remove($user);
        $this->assertSame(0, DB::table(Sessions::SPENT)->count());
    }

    public function test_two_requests_that_refresh_at_the_same_moment_both_carry_on(): void
    {
        $this->user();
        $pair = $this->signIn();

        $first = $this->refresh($pair['refreshToken'])->assertOk()->json();
        // A second request set out with the same token: it gets an access token, and no new refresh token.
        $second = $this->refresh($pair['refreshToken'])->assertOk()->json();
        $this->assertNull($second['refreshToken']);
        $this->me($second['token'])->assertOk();

        // The first one's refresh token is still the one that works.
        $this->refresh($first['refreshToken'])->assertOk();
    }

    public function test_a_sign_in_unused_for_seven_days_ends(): void
    {
        $this->user();
        $pair = $this->signIn();

        $this->travel(7)->days();
        $this->travel(1)->minutes();
        $this->refresh($pair['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_IDLE');
    }

    public function test_no_sign_in_lasts_past_thirty_days_however_busy(): void
    {
        $this->user();
        $pair = $this->signIn();

        // Refreshed every six days, it is never idle...
        for ($day = 6; $day < 30; $day += 6) {
            $this->travel(6)->days();
            $pair = $this->refresh($pair['refreshToken'])->assertOk()->json();
        }
        // ...and an access token issued near the end doesn't outlive it.
        $this->travel(5)->days();
        $this->travel(23 * 60 + 50)->minutes();
        $last = $this->refresh($pair['refreshToken'])->assertOk()->json();
        $this->assertLessThanOrEqual(strtotime($last['refreshExpiresAt']), strtotime($last['expiresAt']));

        $this->travel(11)->minutes();
        $this->me($last['token'])->assertUnauthorized();
        $this->refresh($last['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_EXPIRED');
    }

    public function test_signing_out_ends_the_sign_in_at_once(): void
    {
        $this->user();
        $pair = $this->signIn();

        $this->app['auth']->forgetGuards();
        $this->deleteJson('/api/auth/token', [], ['Authorization' => "Bearer {$pair['token']}"])->assertNoContent();
        $this->me($pair['token'])->assertUnauthorized();
        $this->refresh($pair['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_REVOKED');
    }

    public function test_the_devices_list_shows_sign_ins_and_when_they_end_and_signs_one_out(): void
    {
        $this->user();
        $here = $this->signIn();
        $there = $this->signIn();

        $this->app['auth']->forgetGuards();
        $list = $this->getJson('/api/auth/sessions', ['Authorization' => "Bearer {$here['token']}"])->assertOk();
        $this->assertCount(2, $list->json('data'));
        $current = collect($list->json('data'))->firstWhere('current', true);
        $this->assertNotNull($current['endsAt']);
        $other = collect($list->json('data'))->firstWhere('current', false);

        $this->app['auth']->forgetGuards();
        $this->deleteJson("/api/auth/sessions/{$other['id']}", [], ['Authorization' => "Bearer {$here['token']}"])->assertNoContent();
        $this->me($there['token'])->assertUnauthorized();
        $this->me($here['token'])->assertOk();

        // "Sign out everywhere else" keeps this one.
        $third = $this->signIn();
        $this->app['auth']->forgetGuards();
        $this->deleteJson('/api/auth/sessions', [], ['Authorization' => "Bearer {$here['token']}"])->assertOk()->assertJsonPath('revoked', 1);
        $this->refresh($third['refreshToken'])->assertUnauthorized();
        $this->refresh($here['refreshToken'])->assertOk();
    }

    public function test_an_account_switched_off_can_no_longer_refresh(): void
    {
        $user = $this->user();
        $pair = $this->signIn();
        if (! \Illuminate\Support\Facades\Schema::hasColumn('users', 'active')) {
            $this->markTestSkipped('this app has no way to switch an account off');
        }
        $user->forceFill(['active' => false])->save();

        $this->refresh($pair['refreshToken'])->assertUnauthorized()->assertJsonPath('code', 'SESSION_REVOKED');
    }

    public function test_a_token_that_belongs_to_no_sign_in_keeps_to_the_same_limits(): void
    {
        $user = $this->user();
        $token = $user->createToken('from before sign-ins ended')->plainTextToken;
        $this->me($token)->assertOk();

        // Unused for a week, it is refused.
        $this->travel(7)->days();
        $this->travel(1)->minutes();
        $this->me($token)->assertUnauthorized();

        // Used every day, it lasts 30 days from when it was made, and no longer.
        $this->travelBack();
        $busy = $user->createToken('busy')->plainTextToken;
        for ($day = 1; $day < 30; $day++) {
            $this->travel(1)->days();
            $this->me($busy)->assertOk();
        }
        $this->travel(1)->days();
        $this->me($busy)->assertUnauthorized();
    }

    public function test_with_no_limits_a_sign_in_never_ends(): void
    {
        config(['nevela.auth.session.idle' => null, 'nevela.auth.session.absolute' => null]);
        $user = $this->user();
        $pair = $this->signIn();
        $this->assertNull($pair['refreshExpiresAt']);

        $this->travel(400)->days();
        $this->refresh($pair['refreshToken'])->assertOk();
        $this->me($user->createToken('old')->plainTextToken)->assertOk();
    }

    public function test_ended_sign_ins_are_pruned(): void
    {
        $this->user();
        $kept = $this->signIn();
        $gone = $this->signIn();
        $this->app['auth']->forgetGuards();
        $this->deleteJson('/api/auth/token', [], ['Authorization' => "Bearer {$gone['token']}"])->assertNoContent();

        $this->travel(2)->days();
        $this->artisan('nevela:prune-sessions')->assertSuccessful();
        $this->assertSame(1, DB::table(Sessions::TABLE)->count());
        // The kept one's access token was long expired: gone too. Its refresh token still works.
        $this->assertSame(0, DB::table('personal_access_tokens')->where('expires_at', '<', now()->subDay())->count());
        $this->refresh($kept['refreshToken'])->assertOk();
    }
}
