<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Http\ScannerShield;
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
