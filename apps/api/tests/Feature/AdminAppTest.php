<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Auth\Account;
use Nevela\Laravel\Auth\AuthMail;
use Nevela\Laravel\Auth\Web;
use Tests\TestCase;

/**
 * Two web apps on one API, the triple tier: the public site (NEVELA_WEB_URL) and the staff's
 * admin (NEVELA_ADMIN_URL). Each says which it is, so links go back to the one the person
 * was using; and the API says who is staff, by one rule every app goes by.
 */
class AdminAppTest extends TestCase
{
    use RefreshDatabase;

    private const SITE = 'https://example.com';

    private const ADMIN = 'https://admin.example.com';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        AuthMail::$outbox = [];
        config(['nevela.auth.web_url' => self::SITE, 'nevela.auth.admin_url' => self::ADMIN]);
    }

    private function forgot(string $origin): string
    {
        User::query()->firstOrCreate(['email' => 'ada@example.com'], ['name' => 'Ada', 'password' => Hash::make('a long passphrase')]);
        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com'], ['X-Nevela-Origin' => $origin])->assertOk();

        return end(AuthMail::$outbox)['action'][1];
    }

    public function test_a_link_in_an_email_goes_back_to_the_app_that_asked(): void
    {
        $this->assertStringStartsWith(self::ADMIN.'/reset-password?token=', $this->forgot(self::ADMIN));
        $this->assertStringStartsWith(self::SITE.'/reset-password?token=', $this->forgot(self::SITE));
        // Nobody else's: an address that is neither is the site's.
        $this->assertStringStartsWith(self::SITE.'/reset-password?token=', $this->forgot('https://evil.example'));
    }

    public function test_with_no_app_asking_a_dashboard_page_is_on_the_admin_and_anything_else_on_the_site(): void
    {
        $quiet = Request::create('/');
        $this->assertSame(self::ADMIN.'/dashboard/orders/7', Web::url('/dashboard/orders/7', [], $quiet));
        $this->assertSame(self::ADMIN.'/dashboard', Web::url('/dashboard', [], $quiet));
        $this->assertSame(self::SITE.'/verify-email?email=a%40b.c', Web::url('/verify-email', ['email' => 'a@b.c'], $quiet));
        $this->assertSame(self::SITE.'/dashboards', Web::url('/dashboards', [], $quiet));

        // Asked from the site, a dashboard page is still the admin's: the site has none.
        $fromSite = Request::create('/');
        $fromSite->headers->set('X-Nevela-Origin', self::SITE);
        $this->assertSame(self::ADMIN.'/dashboard/orders/7', Web::url('/dashboard/orders/7', [], $fromSite));
        $this->assertSame(self::SITE.'/reset-password', Web::url('/reset-password', [], $fromSite));

        // Without an admin app, everything is at the one web address, as before.
        config(['nevela.auth.admin_url' => null]);
        $this->assertSame(self::SITE.'/dashboard/orders/7', Web::url('/dashboard/orders/7', [], $quiet));
        $this->assertFalse(Web::allowed(self::ADMIN));
    }

    /** Someone with roles, and their emailed sign-in link asked for from `$origin` (or from no app). */
    private function signInLink(string $email, string $role, ?string $origin): string
    {
        $user = User::query()->firstOrCreate(['email' => $email], ['name' => 'Someone', 'password' => Hash::make('a long passphrase')]);
        Access::grant($user, $role);
        AuthMail::$outbox = [];
        $this->postJson('/api/auth/magic-link', ['email' => $email], $origin ? ['X-Nevela-Origin' => $origin] : [])->assertOk();

        return end(AuthMail::$outbox)['action'][1];
    }

    /** @return array<string, string> the query of a link */
    private static function queryOf(string $url): array
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        return $query;
    }

    public function test_links_follow_who_reads_them(): void
    {
        // The person who asked reads it: the app they asked from, and their own home there.
        $customer = $this->signInLink('cleo@example.com', 'USER', self::SITE);
        $this->assertStringStartsWith(self::SITE.'/api/auth/magic-link?', $customer);
        $this->assertSame('/account', self::queryOf($customer)['next']);

        $staff = $this->signInLink('eve@example.com', 'EDITOR', self::ADMIN);
        $this->assertStringStartsWith(self::ADMIN.'/api/auth/magic-link?', $staff);
        $this->assertSame('/dashboard', self::queryOf($staff)['next']);

        // A verification email takes a customer to their account on the site.
        $this->postJson('/api/auth/email/send', ['email' => 'cleo@example.com'], ['X-Nevela-Origin' => self::SITE])->assertOk();
        $verify = end(AuthMail::$outbox)['action'][1] ?? '';
        $this->assertStringStartsWith(self::SITE.'/verify-email?', $verify);
        $this->assertSame('/account', self::queryOf($verify)['next']);

        // No request speaks for the reader (`nevela user --link`): by who they are. Its link needs a cache the web server shares.
        config(['cache.default' => 'file']);
        $this->artisan('nevela:user', ['account' => 'eve@example.com', '--link' => true])->expectsOutputToContain(self::ADMIN.'/api/auth/magic-link?')->assertSuccessful();
        $this->artisan('nevela:user', ['account' => 'cleo@example.com', '--link' => true])->expectsOutputToContain(self::SITE.'/api/auth/magic-link?')->assertSuccessful();

        // Without an admin app, everyone's home is the dashboard, as before.
        config(['nevela.auth.admin_url' => null]);
        $this->assertSame('/dashboard', self::queryOf($this->signInLink('cleo@example.com', 'USER', self::SITE))['next']);
    }

    public function test_a_passkey_made_on_the_admin_is_tied_to_the_admin(): void
    {
        $request = Request::create('/');
        $request->headers->set('X-Nevela-Origin', self::ADMIN);
        $this->assertSame('admin.example.com', Web::host($request));
    }

    public function test_staff_are_anyone_who_holds_more_than_the_role_people_sign_up_with(): void
    {
        $this->assertFalse(Account::isStaff(['USER'], false));
        $this->assertFalse(Account::isStaff(['user'], false));
        $this->assertFalse(Account::isStaff([], false));
        $this->assertTrue(Account::isStaff(['USER', 'EDITOR'], false));
        $this->assertTrue(Account::isStaff(['EDITOR'], false));
        $this->assertTrue(Account::isStaff(['USER'], true));

        config(['nevela.auth.default_role' => 'CUSTOMER']);
        $this->assertFalse(Account::isStaff(['CUSTOMER'], false));
        $this->assertTrue(Account::isStaff(['USER'], false));

        // An app that gives sign-ups no role has no customers.
        config(['nevela.auth.default_role' => null]);
        $this->assertTrue(Account::isStaff([], false));
    }

    public function test_the_signed_in_person_is_told_whether_they_are_staff(): void
    {
        $customer = User::factory()->create(['email' => 'cleo@example.com', 'password' => Hash::make('a long passphrase')]);
        Access::grant($customer, 'USER');
        $editor = User::factory()->create(['email' => 'eve@example.com', 'password' => Hash::make('a long passphrase')]);
        Access::grant($editor, 'EDITOR');

        $as = function (User $user) {
            $token = $this->postJson('/api/auth/token', ['email' => $user->email, 'password' => 'a long passphrase'])->assertCreated()->json('token');
            $this->app['auth']->forgetGuards();

            return $this->getJson('/api/auth/me', ['Authorization' => "Bearer {$token}"])->assertOk()->json('user');
        };
        $this->assertFalse($as($customer)['staff']);
        $this->assertTrue($as($editor)['staff']);
    }
}
