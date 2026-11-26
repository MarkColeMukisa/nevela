<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Http\ScannerShield;
use Nevela\Laravel\Security\Addresses;
use Tests\TestCase;

/**
 * Security in the app itself (step 11): the signed-in API has a limit, per person and per
 * address, and scanners are turned away before the app does any work.
 */
class SecurityTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, string> */
    private function signIn(string $email = 'owner@example.com'): array
    {
        $user = User::query()->firstOrCreate(['email' => $email], ['name' => 'Owner', 'password' => Hash::make('a long passphrase')]);
        Access::grant($user, 'ADMIN');
        $token = $this->postJson('/api/auth/token', ['email' => $email, 'password' => 'a long passphrase'])->assertCreated()->json('token');
        $this->app['auth']->forgetGuards();

        return ['Authorization' => "Bearer {$token}"];
    }

    public function test_the_signed_in_api_has_a_limit_per_person_and_says_when_to_try_again(): void
    {
        config(['nevela.security.api_per_person' => 3, 'nevela.security.api_per_address' => 0]);
        $as = $this->signIn();
        foreach (range(1, 3) as $ignored) {
            $this->app['auth']->forgetGuards();
            $this->getJson('/api/_nevela/users', $as)->assertOk();
        }
        $this->app['auth']->forgetGuards();
        $refused = $this->getJson('/api/_nevela/users', $as)->assertStatus(429)->assertJsonPath('code', 'TOO_MANY_REQUESTS');
        $this->assertGreaterThan(0, (int) $refused->headers->get('Retry-After'));
        $this->assertStringContainsString('Try again in', $refused->json('error'));

        // Someone else has an allowance of their own.
        $other = $this->signIn('eve@example.com');
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/users', $other)->assertOk();
    }

    public function test_the_dashboard_s_visitors_are_counted_each_by_their_own_address(): void
    {
        config(['nevela.security.api_per_person' => 0, 'nevela.security.api_per_address' => 2, 'nevela.auth.proxy_secret' => 'shared']);
        $as = $this->signIn();
        $from = fn (string $visitor) => $as + ['X-Nevela-Proxy-Secret' => 'shared', 'X-Nevela-Client' => $visitor];

        foreach (range(1, 2) as $ignored) {
            $this->app['auth']->forgetGuards();
            $this->getJson('/api/_nevela/users', $from('203.0.113.7'))->assertOk();
        }
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/users', $from('203.0.113.7'))->assertStatus(429);
        // Another visitor, through the same dashboard server, is not held back by the first.
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/users', $from('198.51.100.20'))->assertOk();
        // Without the secret, an address a request claims for itself isn't believed: it is the server's own.
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/users', $as + ['X-Nevela-Client' => '192.0.2.99'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/users', $as + ['X-Nevela-Client' => '192.0.2.100'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/users', $as + ['X-Nevela-Client' => '192.0.2.101'])->assertStatus(429);
    }

    public function test_the_generated_resource_routes_are_limited_too(): void
    {
        config(['nevela.security.api_per_person' => 1, 'nevela.security.api_per_address' => 0]);
        $as = $this->signIn();
        $this->getJson('/api/products', $as)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/products', $as)->assertStatus(429);
    }

    public function test_an_address_that_keeps_probing_is_blocked_for_a_while_and_then_let_back(): void
    {
        config(['nevela.security.block_after' => 3, 'nevela.security.block_minutes' => 30]);
        $from = ['REMOTE_ADDR' => '203.0.113.9'];
        foreach (['/.env', '/wp-login.php', '/.git/config'] as $probe) {
            $this->withServerVariables($from)->get($probe)->assertNotFound();
        }
        // Blocked now, for everything: not only the probes.
        $blocked = $this->withServerVariables($from)->getJson('/api/_nevela/ping')->assertForbidden()->assertJsonPath('code', 'ADDRESS_BLOCKED');
        $this->assertNotNull($blocked->json('until'));
        $this->assertSame('scanner', Addresses::current()[0]['reason']);
        // Somebody else isn't.
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10'])->getJson('/api/_nevela/ping')->assertOk();

        // Its time up, it is let back.
        $this->travel(31)->minutes();
        $this->withServerVariables($from)->getJson('/api/_nevela/ping')->assertOk();
    }

    public function test_the_web_app_s_server_is_never_blocked_only_the_visitor_it_speaks_for(): void
    {
        config(['nevela.security.block_after' => 3, 'nevela.auth.proxy_secret' => 'shared']);
        $server = ['REMOTE_ADDR' => '198.51.100.1'];
        // Probes passed on by the web app with no visitor: counted for nobody.
        foreach (range(1, 25) as $ignored) {
            $this->withServerVariables($server)->get('/api/.env', ['X-Nevela-Proxy-Secret' => 'shared'])->assertNotFound();
        }
        $this->assertSame([], Addresses::current());
        // With a visitor: that visitor, and not the next one through the same server.
        foreach (range(1, 3) as $ignored) {
            $this->withServerVariables($server)->get('/api/.env', ['X-Nevela-Proxy-Secret' => 'shared', 'X-Nevela-Client' => '203.0.113.50'])->assertNotFound();
        }
        $this->withServerVariables($server)->getJson('/api/_nevela/ping', ['X-Nevela-Proxy-Secret' => 'shared', 'X-Nevela-Client' => '203.0.113.50'])->assertForbidden();
        $this->withServerVariables($server)->getJson('/api/_nevela/ping', ['X-Nevela-Proxy-Secret' => 'shared', 'X-Nevela-Client' => '203.0.113.51'])->assertOk();
        $this->withServerVariables($server)->getJson('/api/_nevela/ping', ['X-Nevela-Proxy-Secret' => 'shared'])->assertOk();
    }

    public function test_requests_beyond_the_per_address_limit_are_strikes_and_the_per_person_limit_s_are_not(): void
    {
        config(['nevela.security.block_after' => 2, 'nevela.security.api_per_address' => 1, 'nevela.security.api_per_person' => 0]);
        $as = $this->signIn();
        $from = ['REMOTE_ADDR' => '203.0.113.20'];
        $this->withServerVariables($from)->getJson('/api/_nevela/users', $as)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withServerVariables($from)->getJson('/api/_nevela/users', $as)->assertStatus(429);
        $this->app['auth']->forgetGuards();
        $this->withServerVariables($from)->getJson('/api/_nevela/users', $as)->assertStatus(429);
        $this->app['auth']->forgetGuards();
        $this->withServerVariables($from)->getJson('/api/_nevela/users', $as)->assertForbidden()->assertJsonPath('code', 'ADDRESS_BLOCKED');

        Addresses::unblock('203.0.113.20');
        config(['nevela.security.api_per_address' => 0, 'nevela.security.api_per_person' => 1]);
        foreach (range(1, 4) as $ignored) {
            $this->app['auth']->forgetGuards();
            $this->withServerVariables($from)->getJson('/api/_nevela/users', $as);
        }
        $this->assertSame([], Addresses::current());
    }

    public function test_ipv6_is_counted_by_its_64_and_this_computer_and_the_exempt_list_never_are(): void
    {
        $this->assertSame('2001:db8:1:2::/64', Addresses::key('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
        $this->assertSame(Addresses::key('2001:db8:1:2::1'), Addresses::key('2001:db8:1:2:ffff::9'));
        $this->assertSame('203.0.113.7', Addresses::key('::ffff:203.0.113.7'));
        $this->assertSame('2001:db8:1:2::/64', Addresses::parse('2001:db8:1:2::/64'));
        $this->assertNull(Addresses::parse('not an address'));

        $this->assertTrue(Addresses::exempt('127.0.0.1'));
        $this->assertTrue(Addresses::exempt('::1'));
        config(['nevela.security.exempt' => ['203.0.113.0/24', '2001:db8::/32', '198.51.100.5']]);
        $this->assertTrue(Addresses::exempt('203.0.113.200'));
        $this->assertFalse(Addresses::exempt('203.0.114.1'));
        $this->assertTrue(Addresses::exempt('2001:db8:9:9::/64'));
        $this->assertTrue(Addresses::exempt('198.51.100.5'));

        config(['nevela.security.block_after' => 1]);
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.99'])->get('/.env');
        $this->assertSame([], Addresses::current());
    }

    public function test_an_administrator_keeps_the_list_and_the_command_line_is_the_way_back_in(): void
    {
        $as = $this->signIn();
        $this->getJson('/api/_nevela/blocked-addresses', $as)->assertOk()->assertJsonPath('data', []);

        $this->app['auth']->forgetGuards();
        $made = $this->postJson('/api/_nevela/blocked-addresses', ['address' => '203.0.113.77', 'minutes' => 60, 'note' => 'Keeps trying passwords'], $as)->assertCreated();
        $this->assertSame('manual', $made->json('reason'));
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.77'])->getJson('/api/_nevela/ping')->assertForbidden();
        $local = ['REMOTE_ADDR' => '127.0.0.1'];

        // Not this computer, not the exempt list, not the address the administrator is using.
        $this->app['auth']->forgetGuards();
        $this->withServerVariables($local)->postJson('/api/_nevela/blocked-addresses', ['address' => '127.0.0.1'], $as)->assertStatus(422);
        $this->app['auth']->forgetGuards();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.88'])->postJson('/api/_nevela/blocked-addresses', ['address' => '203.0.113.88'], $as)->assertStatus(422)->assertJsonPath('issues.0.path', 'address');
        $this->app['auth']->forgetGuards();
        $this->withServerVariables($local)->postJson('/api/_nevela/blocked-addresses', ['address' => 'nonsense'], $as)->assertStatus(422);

        // An editor may not.
        $editor = User::query()->create(['email' => 'eve@example.com', 'name' => 'Eve', 'password' => Hash::make('a long passphrase')]);
        Access::grant($editor, 'EDITOR');
        $token = $this->withServerVariables($local)->postJson('/api/auth/token', ['email' => 'eve@example.com', 'password' => 'a long passphrase'])->json('token');
        $this->app['auth']->forgetGuards();
        $this->withServerVariables($local)->getJson('/api/_nevela/blocked-addresses', ['Authorization' => "Bearer {$token}"])->assertForbidden();

        // Cleared from the dashboard, or the command line.
        $this->app['auth']->forgetGuards();
        $this->withServerVariables($local)->deleteJson('/api/_nevela/blocked-addresses/'.$made->json('id'), [], $as)->assertNoContent();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.77'])->getJson('/api/_nevela/ping')->assertOk();
        Addresses::block('203.0.113.78', 'scanner', 60, null, null);
        $this->artisan('nevela:security', ['action' => 'blocked'])->expectsOutputToContain('203.0.113.78')->assertSuccessful();
        $this->artisan('nevela:security', ['action' => 'unblock', 'address' => '203.0.113.78'])->expectsOutputToContain('can reach the app again')->assertSuccessful();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.78'])->getJson('/api/_nevela/ping')->assertOk();
    }

    public function test_scanners_are_turned_away_and_counted(): void
    {
        foreach (['/.env', '/laravel.env', '/.env.backup', '/api/.env', '/.git/config', '/wp-admin/', '/wp-login.php', '/xmlrpc.php', '/phpmyadmin/index.php', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/backup.sql'] as $probe) {
            $this->get($probe)->assertNotFound();
        }
        $this->assertSame(11, RateLimiter::attempts('nevela-scan:127.0.0.1'));

        // What an app does answer is left alone.
        $this->getJson('/api/_nevela/ping')->assertOk();
        $this->assertFalse(ScannerShield::isProbe('api/products'));
        $this->assertFalse(ScannerShield::isProbe('api/environments'));
        $this->assertFalse(ScannerShield::isProbe('blog/wordpress-tips'));

        // An app can add its own, and switch it off.
        config(['nevela.security.scanner_paths' => ['#^old-admin#']]);
        $this->assertTrue(ScannerShield::isProbe('old-admin/login'));
        config(['nevela.security.scanners' => false]);
        RateLimiter::clear('nevela-scan:127.0.0.1');
        $this->get('/.env')->assertNotFound();
        $this->assertSame(0, RateLimiter::attempts('nevela-scan:127.0.0.1'));
    }
}
