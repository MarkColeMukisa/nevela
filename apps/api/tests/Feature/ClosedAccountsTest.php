<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\ClosedAccounts;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Auth\AuthMail;
use Nevela\Laravel\Models\Role;
use Tests\TestCase;

/**
 * Deleted accounts, over HTTP: a closed account is kept and can be restored, and an email
 * that had an account doesn't get another by signing up again.
 */
class ClosedAccountsTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct horse battery staple';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        ClosedAccounts::reset();
        Permissions::forget();
        Cache::flush();
        AuthMail::$outbox = [];
        config(['nevela.auth.registration' => true]);
    }

    /** @param array<string, mixed> $attributes */
    private function user(string $role, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $this->assertTrue(Access::grant($user, $role), "no role called {$role}");

        return $user->refresh();
    }

    private function signedInAs(User $user): void
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user);
    }

    /** As a visitor: nobody is signed in. */
    private function signedOut(): void
    {
        $this->app['auth']->forgetGuards();
    }

    /** @return array<string, string> */
    private function registration(string $email): array
    {
        return ['name' => 'Someone', 'email' => $email, 'password' => self::PASSWORD];
    }

    public function test_deleting_a_user_closes_the_account_and_keeps_it(): void
    {
        $admin = $this->user('ADMIN', ['name' => 'Ada Admin']);
        $person = $this->user('EDITOR', ['name' => 'Amara Okafor', 'email' => 'amara@example.com']);
        $person->createToken('laptop');
        $this->signedInAs($admin);

        $this->getJson('/api/_nevela/users')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('meta.keepsDeleted', true);
        $this->deleteJson("/api/_nevela/users/{$person->id}")->assertNoContent();

        // Kept, signed out everywhere, and no longer among the users.
        $this->assertNotNull(User::find($person->id)?->closed_at);
        $this->assertSame(0, $person->tokens()->count());
        $this->getJson('/api/_nevela/users')->assertJsonPath('meta.total', 1);
        $this->getJson("/api/_nevela/users/{$person->id}")->assertNotFound();
        $this->patchJson("/api/_nevela/users/{$person->id}", ['name' => 'Back door'])->assertNotFound();
        // Its roles are kept for when it comes back, and it isn't counted as holding them.
        $this->assertSame(1, DB::table('nevela_role_user')->where('user_id', (string) $person->id)->count());
        $editor = collect($this->getJson('/api/_nevela/roles')->json('data'))->firstWhere('name', 'EDITOR');
        $this->assertSame(0, $editor['users']);
        $this->assertSame(1, collect($this->getJson('/api/_nevela/roles')->json('data'))->firstWhere('name', 'ADMIN')['users']);
        $this->assertFalse(User::find($person->id)->can('products.view'));

        $this->getJson('/api/_nevela/deleted-accounts')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', (string) $person->id)
            ->assertJsonPath('data.0.email', 'amara@example.com')
            ->assertJsonPath('data.0.roles.0.name', 'EDITOR')
            ->assertJsonPath('data.0.closedBy', 'admin')
            ->assertJsonPath('data.0.closedByName', 'Ada Admin')
            ->assertJsonPath('data.0.withinYours', true)
            ->assertJsonPath('blocked', 0);
        $this->getJson('/api/_nevela/deleted-accounts?q=nobody')->assertJsonPath('meta.total', 0);

        // It can't sign in, by any way, and is sent nothing that would let it.
        $this->signedOut();
        $this->postJson('/api/auth/token', ['email' => 'amara@example.com', 'password' => 'password'])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_CLOSED');
        $this->postJson('/api/auth/magic-link', ['email' => 'amara@example.com'])->assertOk();
        $this->postJson('/api/auth/email-code', ['email' => 'amara@example.com'])->assertOk();
        $this->postJson('/api/auth/password/forgot', ['email' => 'amara@example.com'])->assertOk();
        $this->assertSame([], AuthMail::$outbox);
    }

    public function test_a_closed_account_is_restored_as_it_was(): void
    {
        $admin = $this->user('ADMIN');
        $person = $this->user('EDITOR', ['email' => 'amara@example.com']);
        $this->signedInAs($admin);
        $this->deleteJson("/api/_nevela/users/{$person->id}")->assertNoContent();

        // The address belongs to the deleted account: nobody else is given it.
        $this->postJson('/api/_nevela/users', ['name' => 'Another', 'email' => 'Amara@example.com', 'password' => self::PASSWORD, 'roles' => []])
            ->assertStatus(422)->assertJsonPath('issues.0.path', 'email')->assertJsonPath('issues.0.message', 'A deleted account has this email. Restore it from Deleted accounts.');

        $this->postJson("/api/_nevela/deleted-accounts/{$person->id}/restore")->assertOk()
            ->assertJsonPath('id', (string) $person->id)->assertJsonPath('roles.0.name', 'EDITOR')->assertJsonPath('active', true);
        $this->assertSame('Your Laravel account is open again', end(AuthMail::$outbox)['subject']);
        $this->getJson('/api/_nevela/users')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/_nevela/deleted-accounts')->assertJsonPath('meta.total', 0);
        $this->assertSame(0, DB::table(ClosedAccounts::BLOCKED)->count());
        // Restored once: it isn't a deleted account any more.
        $this->postJson("/api/_nevela/deleted-accounts/{$person->id}/restore")->assertNotFound();

        // The password it had still opens it, with the roles it had.
        $this->signedOut();
        $this->postJson('/api/auth/token', ['email' => 'amara@example.com', 'password' => 'password'])->assertCreated()->assertJsonPath('user.roles', ['EDITOR']);
    }

    public function test_someone_closes_their_own_account_with_their_password(): void
    {
        $this->user('ADMIN');
        $person = $this->user('USER', ['email' => 'sofia@example.com']);
        $person->createToken('laptop');
        $person->createToken('phone');
        $this->signedInAs($person);

        $this->getJson('/api/auth/config')->assertJsonPath('closeAccount', true);
        $this->postJson('/api/auth/close', ['password' => 'not it'])->assertStatus(422)->assertJsonPath('code', 'INVALID_PASSWORD');
        $this->assertNull(User::find($person->id)->closed_at);

        $this->postJson('/api/auth/close', ['password' => 'password'])->assertOk()->assertJsonPath('closed', true);
        $this->assertNotNull(User::find($person->id)->closed_at);
        $this->assertSame(0, $person->tokens()->count(), 'every device is signed out');
        $this->assertSame('Your Laravel account was closed', end(AuthMail::$outbox)['subject']);

        $this->signedOut();
        $this->postJson('/api/auth/token', ['email' => 'sofia@example.com', 'password' => 'password'])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_CLOSED');

        // An administrator sees who closed it: its owner.
        $this->signedInAs(User::query()->whereNull('closed_at')->firstOrFail());
        $this->getJson('/api/_nevela/deleted-accounts')->assertJsonPath('data.0.closedBy', 'self')->assertJsonPath('data.0.closedByName', null);
    }

    public function test_the_only_administrator_cannot_close_their_account(): void
    {
        $admin = $this->user('ADMIN');
        $this->signedInAs($admin);
        $this->postJson('/api/auth/close', ['password' => 'password'])->assertStatus(409)->assertJsonPath('code', 'LAST_ADMIN');
        $this->assertNull(User::find($admin->id)->closed_at);

        // With another, they can. And a closed administrator is not one who is left.
        $second = $this->user('ADMIN');
        $this->postJson('/api/auth/close', ['password' => 'password'])->assertOk();
        $this->signedInAs($second);
        $this->postJson('/api/auth/close', ['password' => 'password'])->assertStatus(409)->assertJsonPath('code', 'LAST_ADMIN');
    }

    public function test_closing_your_own_account_can_be_switched_off(): void
    {
        config(['nevela.auth.close_account' => false]);
        $this->user('ADMIN');
        $this->signedInAs($person = $this->user('USER'));

        $this->getJson('/api/auth/config')->assertJsonPath('closeAccount', false);
        $this->postJson('/api/auth/close', ['password' => 'password'])->assertNotFound();
        $this->assertNull(User::find($person->id)->closed_at);
    }

    public function test_a_closed_accounts_email_cannot_sign_up_again(): void
    {
        $this->signedInAs($this->user('ADMIN'));
        $person = $this->user('USER', ['email' => 'mark@gmail.com']);
        $this->deleteJson("/api/_nevela/users/{$person->id}")->assertNoContent();
        $this->signedOut();

        // The address itself, and other spellings of the same mailbox.
        foreach (['mark@gmail.com', 'Mark@Gmail.com', 'm.a.r.k@gmail.com', 'mark+new@gmail.com', 'ma.rk+again@googlemail.com'] as $email) {
            $this->postJson('/api/auth/register', $this->registration($email))->assertStatus(422)->assertJsonPath('code', 'ACCOUNT_CLOSED');
        }
        $this->assertSame(1, User::query()->whereRaw('lower(email) like ?', ['%gmail%'])->count());

        // Someone else is no concern of it.
        $this->postJson('/api/auth/register', $this->registration('marks@gmail.com'))->assertCreated();
        $this->postJson('/api/auth/register', $this->registration('mark@example.com'))->assertCreated();
    }

    public function test_removed_for_good_the_email_stays_blocked_until_it_is_allowed(): void
    {
        $this->signedInAs($admin = $this->user('ADMIN'));
        $person = $this->user('USER', ['email' => 'mark@gmail.com']);
        $person->createToken('laptop');
        $this->deleteJson("/api/_nevela/users/{$person->id}")->assertNoContent();

        // Only what is deleted can be removed for good.
        $this->deleteJson("/api/_nevela/deleted-accounts/{$admin->id}")->assertNotFound();
        $this->deleteJson("/api/_nevela/deleted-accounts/{$person->id}")->assertNoContent();
        $this->assertNull(User::find($person->id));
        $this->assertSame(0, DB::table('nevela_role_user')->where('user_id', (string) $person->id)->count());
        $this->getJson('/api/_nevela/deleted-accounts')->assertJsonPath('meta.total', 0)->assertJsonPath('blocked', 1);

        // What is left is a fingerprint and a hint. The address is nowhere.
        $row = DB::table(ClosedAccounts::BLOCKED)->sole();
        $this->assertNull($row->user_id);
        $this->assertSame('m•••@gmail.com', $row->hint);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $row->fingerprint);
        $this->assertStringNotContainsString('mark@gmail.com', json_encode($row));
        $this->getJson('/api/_nevela/blocked-emails')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.hint', 'm•••@gmail.com')->assertJsonPath('data.0.id', $row->id);

        // Neither a visitor nor an administrator makes an account with it.
        $this->postJson('/api/_nevela/users', ['name' => 'Mark', 'email' => 'mark@gmail.com', 'password' => self::PASSWORD, 'roles' => []])
            ->assertStatus(422)->assertJsonPath('issues.0.path', 'email');
        $this->signedOut();
        $this->postJson('/api/auth/register', $this->registration('mark@gmail.com'))->assertStatus(422)->assertJsonPath('code', 'EMAIL_BLOCKED');
        $this->postJson('/api/auth/register', $this->registration('m.ark+back@gmail.com'))->assertStatus(422)->assertJsonPath('code', 'EMAIL_BLOCKED');

        // Until someone allows it again.
        $this->signedInAs($admin);
        $this->deleteJson("/api/_nevela/blocked-emails/{$row->id}")->assertNoContent();
        $this->deleteJson("/api/_nevela/blocked-emails/{$row->id}")->assertNotFound();
        $this->getJson('/api/_nevela/blocked-emails')->assertJsonPath('meta.total', 0);
        $this->signedOut();
        $this->postJson('/api/auth/register', $this->registration('mark@gmail.com'))->assertCreated();
    }

    public function test_a_blocked_email_stays_blocked_when_the_app_key_is_rotated(): void
    {
        $this->signedInAs($admin = $this->user('ADMIN'));
        $person = $this->user('USER', ['email' => 'mark@gmail.com']);
        $this->deleteJson("/api/_nevela/users/{$person->id}")->assertNoContent();
        $this->deleteJson("/api/_nevela/deleted-accounts/{$person->id}")->assertNoContent();

        // A new key, with the old one kept as Laravel's own key rotation keeps it.
        $old = config('app.key');
        config(['app.key' => 'base64:'.base64_encode(random_bytes(32)), 'app.previous_keys' => [$old]]);
        $this->assertNotSame(DB::table(ClosedAccounts::BLOCKED)->value('fingerprint'), ClosedAccounts::fingerprint('mark@gmail.com'));
        $this->signedOut();
        $this->postJson('/api/auth/register', $this->registration('m.ark@gmail.com'))->assertStatus(422)->assertJsonPath('code', 'EMAIL_BLOCKED');

        // Allowed again, made again and removed again: one entry for the mailbox, under today's key.
        $this->signedInAs($admin);
        $this->deleteJson('/api/_nevela/blocked-emails/'.DB::table(ClosedAccounts::BLOCKED)->value('id'))->assertNoContent();
        DB::table(ClosedAccounts::BLOCKED)->insert(['id' => 'from-before', 'fingerprint' => hash_hmac('sha256', 'mark@gmail.com', (string) $old), 'hint' => 'm•••@gmail.com', 'user_id' => null, 'blocked_at' => now()->subYear()]);
        $again = $this->user('USER', ['email' => 'mark@gmail.com']);
        $this->deleteJson("/api/_nevela/users/{$again->id}")->assertNoContent();
        $this->deleteJson("/api/_nevela/deleted-accounts/{$again->id}")->assertNoContent();
        $this->assertSame([ClosedAccounts::fingerprint('mark@gmail.com')], DB::table(ClosedAccounts::BLOCKED)->pluck('fingerprint')->all());

        // The old key dropped, the fingerprints made with it match nothing.
        config(['app.key' => 'base64:'.base64_encode(random_bytes(32)), 'app.previous_keys' => []]);
        $this->assertNull(ClosedAccounts::standing('mark@gmail.com'));
    }

    public function test_an_address_is_compared_as_the_mailbox_it_reaches(): void
    {
        $this->assertSame('mark@gmail.com', ClosedAccounts::canonical(' M.ar.k+shop@GoogleMail.com '));
        $this->assertSame('mark@example.com', ClosedAccounts::canonical('Mark+news@example.com'));
        // Dots only mean nothing at Gmail.
        $this->assertSame('m.ark@example.com', ClosedAccounts::canonical('m.ark@example.com'));
        $this->assertSame('+odd@example.com', ClosedAccounts::canonical('+odd@example.com'));
        $this->assertSame(ClosedAccounts::fingerprint('mark@gmail.com'), ClosedAccounts::fingerprint('M.ark+x@gmail.com'));
        $this->assertNotSame(ClosedAccounts::fingerprint('mark@gmail.com'), ClosedAccounts::fingerprint('mark@example.com'));
        $this->assertSame('m•••@example.com', ClosedAccounts::hint('Mark.Cole@Example.com'));
    }

    public function test_deleted_accounts_are_for_those_who_may_delete_users_and_within_their_own(): void
    {
        $admin = $this->user('ADMIN');
        $closedAdmin = $this->user('ADMIN');
        $closedUser = $this->user('USER');
        Role::query()->create(['name' => 'People', 'description' => null, 'grants' => ['users.*'], 'is_system' => false]);
        $manager = $this->user('People');
        $this->signedInAs($admin);
        $this->deleteJson("/api/_nevela/users/{$closedAdmin->id}")->assertNoContent();
        $this->deleteJson("/api/_nevela/users/{$closedUser->id}")->assertNoContent();

        // An editor sees users and deletes none: none of this is theirs.
        $this->signedInAs($this->user('EDITOR'));
        $this->getJson('/api/_nevela/deleted-accounts')->assertForbidden();
        $this->getJson('/api/_nevela/blocked-emails')->assertForbidden();
        $this->postJson("/api/_nevela/deleted-accounts/{$closedUser->id}/restore")->assertForbidden();
        $this->deleteJson("/api/_nevela/deleted-accounts/{$closedUser->id}")->assertForbidden();

        // Someone who manages users deals with accounts that may do no more than they may.
        $this->signedInAs($manager);
        $listed = collect($this->getJson('/api/_nevela/deleted-accounts')->assertOk()->json('data'))->keyBy('id');
        $this->assertFalse($listed[(string) $closedAdmin->id]['withinYours']);
        $this->assertTrue($listed[(string) $closedUser->id]['withinYours']);
        $this->postJson("/api/_nevela/deleted-accounts/{$closedAdmin->id}/restore")->assertForbidden()->assertJsonPath('code', 'ADMIN_ONLY');
        $this->deleteJson("/api/_nevela/deleted-accounts/{$closedAdmin->id}")->assertForbidden()->assertJsonPath('code', 'ADMIN_ONLY');
        $this->postJson("/api/_nevela/deleted-accounts/{$closedUser->id}/restore")->assertOk();
    }

    public function test_before_the_migration_deleting_a_user_removes_them_as_it_did(): void
    {
        // As an app is between `nevela upgrade` and `nevela migrate`.
        Schema::dropIfExists(ClosedAccounts::BLOCKED);
        Schema::table('users', fn (Blueprint $table) => $table->dropIndex(['closed_at']));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['closed_at', 'closed_by']));
        ClosedAccounts::reset();

        $this->signedInAs($this->user('ADMIN'));
        $person = $this->user('USER', ['email' => 'mark@gmail.com']);
        $this->getJson('/api/_nevela/users')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('meta.keepsDeleted', false);
        $this->deleteJson("/api/_nevela/users/{$person->id}")->assertNoContent();
        $this->assertNull(User::find($person->id));

        $this->getJson('/api/_nevela/deleted-accounts')->assertStatus(409)->assertJsonPath('code', 'MIGRATION_NEEDED');
        $this->getJson('/api/_nevela/blocked-emails')->assertStatus(409)->assertJsonPath('code', 'MIGRATION_NEEDED');
        $this->postJson('/api/auth/close', ['password' => 'password'])->assertStatus(409)->assertJsonPath('code', 'MIGRATION_NEEDED');
        // Signing up, and signing in, go on as before.
        $this->signedOut();
        $this->postJson('/api/auth/register', $this->registration('mark@gmail.com'))->assertCreated();
        $this->postJson('/api/auth/token', ['email' => 'mark@gmail.com', 'password' => self::PASSWORD])->assertCreated();
    }
}
