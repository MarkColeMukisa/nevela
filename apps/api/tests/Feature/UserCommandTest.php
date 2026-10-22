<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\ClosedAccounts;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Models\Role;
use Tests\TestCase;

/**
 * `nevela user <email>`: an account that exists, changed from the command line. A first
 * production sign-in can fail on a seeded account nobody knows the password of, before
 * mail or a queue worker is there for "Forgot password".
 */
class UserCommandTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'the old password';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
    }

    private function owner(): User
    {
        $user = User::factory()->unverified()->create(['name' => 'Ada', 'email' => 'owner@example.com', 'password' => Hash::make(self::PASSWORD)]);
        Access::grant($user, 'USER');

        return $user;
    }

    private function signIn(string $password = self::PASSWORD): \Illuminate\Testing\TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/auth/token', ['email' => 'owner@example.com', 'password' => $password]);
    }

    public function test_a_new_password_is_asked_for_twice_and_never_taken_from_the_command_line(): void
    {
        $this->owner();

        $this->artisan('nevela:user', ['account' => 'Owner@Example.com', '--reset' => true])
            ->expectsQuestion('New password (at least 8 characters)', 'a brand new password')
            ->expectsQuestion('The same again', 'a brand new password')
            ->expectsOutputToContain('owner@example.com has a new password')
            ->assertSuccessful();
        $this->signIn('a brand new password')->assertCreated();
        $this->signIn()->assertUnauthorized();

        // Two that differ, or one too short: nothing changes.
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--reset' => true])
            ->expectsQuestion('New password (at least 8 characters)', 'one password here')
            ->expectsQuestion('The same again', 'another one there')
            ->assertFailed();
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--reset' => true])
            ->expectsQuestion('New password (at least 8 characters)', 'short')
            ->expectsQuestion('The same again', 'short')
            ->assertFailed();
        $this->signIn('a brand new password')->assertCreated();

        // On the command line it would stay in the shell's history.
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--reset' => true, '--password' => 'in the history'])->assertFailed();
        // And with nothing to ask in, it says how else.
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--reset' => true, '--no-interaction' => true])
            ->expectsOutputToContain('--password-stdin')
            ->assertFailed();
    }

    public function test_signing_out_everywhere_ends_every_sign_in_and_token(): void
    {
        $user = $this->owner();
        $this->signIn()->assertCreated();
        $this->signIn()->assertCreated();
        $user->createToken('a script of theirs');
        $this->assertSame(3, DB::table('personal_access_tokens')->count());

        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--sign-out-everywhere' => true])
            ->expectsOutputToContain('signed out everywhere')
            ->assertSuccessful();

        $this->assertSame(0, DB::table('personal_access_tokens')->count());
        $this->assertSame(0, DB::table('nevela_sessions')->whereNull('revoked_at')->count());
    }

    public function test_an_account_is_verified_and_given_a_role_and_nothing_changes_when_one_part_is_wrong(): void
    {
        $user = $this->owner();

        // A role that doesn't exist: refused before the address is touched.
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--verify' => true, '--role' => 'Wizard'])->assertFailed();
        $this->assertNull($user->fresh()->email_verified_at);

        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--verify' => true, '--role' => 'admin'])
            ->expectsOutputToContain('owner@example.com is now ADMIN and has its address marked verified')
            ->assertSuccessful();
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertContains('ADMIN', Access::rolesOf($user)->pluck('name')->all());
        $this->assertSame(1, Access::otherAdmins());

        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--role' => 'ADMIN'])->expectsOutputToContain('was already ADMIN')->assertSuccessful();
    }

    public function test_status_names_an_administrator_whose_roles_only_together_come_to_everything(): void
    {
        $user = $this->owner();
        $grants = Permissions::keys();
        // Everything, split across two roles: neither alone is an administrator.
        [$first, $second] = array_chunk($grants, (int) ceil(count($grants) / 2));
        Role::query()->create(['name' => 'HALF_ONE', 'grants' => $first]);
        Role::query()->create(['name' => 'HALF_TWO', 'grants' => $second]);
        Access::grant($user, 'HALF_ONE');
        Access::grant($user, 'HALF_TWO');
        $this->assertTrue(Access::isAdmin($user->fresh()));
        $this->assertSame(0, Access::otherAdmins());

        $this->artisan('nevela:status')->expectsOutputToContain('owner@example.com');
    }

    public function test_a_printed_link_signs_in_once_without_proving_the_address(): void
    {
        $user = $this->owner();

        // The tests' cache is kept in one process, where a real web server would never find the link.
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--link' => true])->expectsOutputToContain('shared cache store')->assertFailed();
        config(['cache.default' => 'file']);

        Artisan::call('nevela:user', ['account' => 'owner@example.com', '--link' => true]);
        $this->assertTrue(preg_match('#https?://\S+/api/auth/magic-link\?\S+#', Artisan::output(), $match) === 1, Artisan::output());
        parse_str((string) parse_url($match[0], PHP_URL_QUERY), $query);
        $this->assertSame('/dashboard', $query['next']);

        $this->postJson('/api/auth/magic-link/verify', ['token' => $query['token']])->assertCreated()->assertJsonStructure(['token']);
        // Nobody opened a link sent to the address, so it isn't proved.
        $this->assertNull($user->fresh()->email_verified_at);
        // And it works once.
        $this->postJson('/api/auth/magic-link/verify', ['token' => $query['token']])->assertUnauthorized();
    }

    public function test_a_printed_link_still_asks_for_an_emailed_second_step(): void
    {
        $this->owner();
        $token = $this->signIn()->assertCreated()->json('token');
        $this->postJson('/api/auth/two-factor/enable', ['password' => self::PASSWORD, 'method' => 'email'], ['Authorization' => "Bearer {$token}"])->assertOk();
        $this->app['auth']->forgetGuards();

        config(['cache.default' => 'file']);
        Artisan::call('nevela:user', ['account' => 'owner@example.com', '--link' => true]);
        preg_match('#https?://\S+/api/auth/magic-link\?\S+#', Artisan::output(), $match);
        parse_str((string) parse_url($match[0], PHP_URL_QUERY), $query);

        // An emailed link would stand in for the emailed code. This one wasn't emailed.
        $this->postJson('/api/auth/magic-link/verify', ['token' => $query['token']])->assertOk()->assertJsonPath('twoFactor', true)->assertJsonMissingPath('token');
    }

    public function test_an_account_is_described_and_one_that_is_missing_closed_or_blocked_is_refused(): void
    {
        $user = $this->owner();

        $this->artisan('nevela:user', ['account' => 'owner@example.com'])
            ->expectsOutputToContain('not verified')
            ->expectsOutputToContain('--reset')
            ->assertSuccessful();

        $this->artisan('nevela:user', ['account' => 'nobody@example.com', '--verify' => true])
            ->expectsOutputToContain('nevela user --email=nobody@example.com')
            ->assertFailed();

        // A rename here would be taken quietly and look as if it had worked.
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--name' => 'New Name'])->expectsOutputToContain('Users screen')->assertFailed();
        $this->assertSame('Ada', $user->fresh()->name);

        ClosedAccounts::close($user);
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--reset' => true])
            ->expectsOutputToContain('is closed')
            ->assertFailed();

        // Removed for good, its address is blocked.
        ClosedAccounts::purge($user);
        $this->artisan('nevela:user', ['account' => 'owner@example.com', '--verify' => true])
            ->expectsOutputToContain('is blocked')
            ->assertFailed();

        // These are for an account that exists, so one has to be named.
        $this->artisan('nevela:user', ['--reset' => true, '--no-interaction' => true])->assertFailed();
    }
}
