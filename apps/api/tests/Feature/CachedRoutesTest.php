<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * With the routes cached (`route:cache`, or `optimize`, which many hosts run on start), the
 * routes come from the cache and Nevela's route setup doesn't run. What they refer to by
 * name, the sign-in rate limiter and the public throttle, must be there all the same:
 * without them every sign-in and every public route was a 500 (#135).
 */
class CachedRoutesTest extends TestCase
{
    private string $cache;

    protected function setUp(): void
    {
        parent::setUp();

        // A cache file of the test's own, never the app's bootstrap/cache. Relative: Laravel
        // reads a path not starting with a slash as within the app, a Windows one included.
        $relative = 'storage/framework/testing-routes-'.getmypid().'.php';
        $this->useRouteCache($relative);
        $this->refreshApplication();
        $this->cache = $this->app->basePath($relative);

        Artisan::call('route:cache');
        $this->refreshApplication();
        Artisan::call('migrate');
    }

    protected function tearDown(): void
    {
        $this->useRouteCache(null);
        @unlink($this->cache);
        parent::tearDown();
    }

    public function test_the_routes_come_from_the_cache(): void
    {
        $this->assertTrue($this->app->routesAreCached());
    }

    public function test_signing_in_works_with_the_routes_cached(): void
    {
        $this->postJson('/api/auth/token', ['email' => 'nobody@example.com', 'password' => 'not it'])->assertStatus(401);
    }

    public function test_a_public_route_works_with_the_routes_cached(): void
    {
        $this->getJson('/api/public/_nevela/resources')->assertOk();
    }

    private function useRouteCache(?string $path): void
    {
        if ($path === null) {
            putenv('APP_ROUTES_CACHE');
            unset($_ENV['APP_ROUTES_CACHE'], $_SERVER['APP_ROUTES_CACHE']);

            return;
        }
        putenv("APP_ROUTES_CACHE={$path}");
        $_ENV['APP_ROUTES_CACHE'] = $_SERVER['APP_ROUTES_CACHE'] = $path;
    }
}
