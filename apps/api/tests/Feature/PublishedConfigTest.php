<?php

namespace Tests\Feature;

use Nevela\Laravel\Auth\Sessions;
use Nevela\Laravel\NevelaServiceProvider;
use Nevela\Laravel\Support\PublishedConfig;
use Tests\TestCase;

/**
 * An app with a config/nevela.php published by an older Nevela. Laravel merges a package's
 * config one level deep, so the `auth` section of a file from before 0.10 used to hide
 * `auth.session` and `auth.social` altogether, and sign-ins never ended.
 */
class PublishedConfigTest extends TestCase
{
    /** config/nevela.php as `vendor:publish` wrote it in 0.1.0. */
    private const FROM_0_1 = [
        'descriptors_path' => 'nevela/resources',
        'web_path' => '../web',
        'prefix' => 'api',
        'middleware' => ['api', 'auth:sanctum'],
        'auth' => ['enabled' => true, 'token_name' => 'nevela-web'],
        'per_page' => 25,
        'max_per_page' => 100,
    ];

    /** Boot the package over the app's file, as Laravel does. */
    private function boot(array $published): void
    {
        config(['nevela' => $published]);
        (new NevelaServiceProvider($this->app))->register();
    }

    public function test_an_auth_section_from_before_0_10_keeps_the_session_and_social_settings(): void
    {
        $this->boot([...self::FROM_0_1, 'auth' => ['enabled' => true, 'token_name' => 'old-name', 'registration' => true]]);

        $package = require base_path('vendor/nevela/laravel/config/nevela.php');
        $this->assertSame($package['auth']['session'], config('nevela.auth.session'));
        $this->assertSame($package['auth']['social'], config('nevela.auth.social'));
        $this->assertSame('old-name', config('nevela.auth.token_name'));
        $this->assertTrue(config('nevela.auth.registration'));

        $this->assertSame(15, Sessions::accessMinutes());
        $this->assertSame(60 * 24 * 7, Sessions::idleMinutes());
        $this->assertSame(60 * 24 * 30, Sessions::absoluteMinutes());
    }

    public function test_no_limit_is_only_what_the_app_says(): void
    {
        $this->boot([...self::FROM_0_1, 'auth' => [...self::FROM_0_1['auth'], 'session' => ['idle' => null, 'absolute' => '0']]]);

        // null in the file, or NEVELA_SESSION_ABSOLUTE=0 in .env.
        $this->assertNull(Sessions::idleMinutes());
        $this->assertNull(Sessions::absoluteMinutes());
        $this->assertSame(15, Sessions::accessMinutes());
    }

    public function test_the_session_limits_hold_even_where_the_setting_is_gone(): void
    {
        config(['nevela.auth.session' => null]);

        $this->assertSame(15, Sessions::accessMinutes());
        $this->assertSame(60 * 24 * 7, Sessions::idleMinutes());
        $this->assertSame(60 * 24 * 30, Sessions::absoluteMinutes());
    }

    public function test_every_setting_since_0_1_says_which_release_added_it(): void
    {
        // A setting added to config/nevela.php needs a line in PublishedConfig::ADDED, so an
        // app whose file predates it is told the version.
        $missing = PublishedConfig::missing(require base_path('vendor/nevela/laravel/config/nevela.php'), self::FROM_0_1);

        $this->assertArrayHasKey('auth.session', $missing);
        $this->assertSame([], array_keys(array_filter($missing, fn (?string $version) => $version === null)));
    }
}
