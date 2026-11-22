<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Auth\AuthMail;
use Nevela\Laravel\Console\DeployCheckCommand;
use Nevela\Laravel\Notices\Conditions;
use Tests\TestCase;

/**
 * An API with a mobile app and no dashboard (`nevela new --tier mobile`, NEVELA_DASHBOARD=false):
 * emails carry codes and no links to pages that aren't there, and nothing asks where the
 * dashboard is.
 */
class NoDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        Cache::flush();
        AuthMail::$outbox = [];
        config(['nevela.dashboard' => false]);
    }

    public function test_the_verification_email_carries_the_code_and_no_link(): void
    {
        config(['nevela.auth.registration' => true]);
        $this->postJson('/api/auth/register', ['name' => 'Ada', 'email' => 'ada@example.com', 'password' => 'a long enough password 42'])->assertCreated();

        $mail = end(AuthMail::$outbox);
        $this->assertNull($mail['action']);
        $this->assertMatchesRegularExpression('/^\d{6}$/', (string) $mail['secret']);
        $this->assertStringContainsString($mail['secret'], implode(' ', $mail['lines']));
    }

    public function test_no_email_links_to_pages_that_are_not_there(): void
    {
        User::factory()->create(['email' => 'ada@example.com']);

        // A sign-in link and a reset link would open dashboard pages: neither is sent.
        $this->getJson('/api/auth/config')->assertOk()->assertJsonPath('magicLink', false)->assertJsonPath('emailCode', true);
        $this->postJson('/api/auth/magic-link', ['email' => 'ada@example.com'])->assertNotFound();
        $this->postJson('/api/auth/password/forgot', ['email' => 'ada@example.com'])->assertNotFound()->assertJsonPath('code', 'NO_DASHBOARD');
        // The same answer for an address with no account: it gives nothing away.
        $this->postJson('/api/auth/password/forgot', ['email' => 'nobody@example.com'])->assertNotFound()->assertJsonPath('code', 'NO_DASHBOARD');
        $this->assertSame([], AuthMail::$outbox);

        // A code is typed into the app, so it still comes.
        $this->postJson('/api/auth/email-code', ['email' => 'ada@example.com'])->assertOk();
        $this->assertNull(end(AuthMail::$outbox)['action']);

        $this->artisan('nevela:user', ['account' => 'ada@example.com', '--link' => true])->expectsOutputToContain('NEVELA_DASHBOARD=false')->assertFailed();
    }

    public function test_deploy_check_does_not_ask_where_the_dashboard_is(): void
    {
        $this->app['env'] = 'production';
        config([
            'app.debug' => false,
            'cache.default' => 'file',
            'queue.default' => 'sync',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => 'smtp-relay.brevo.com',
            'mail.from.address' => 'hello@kianrover.com',
            // Left as it was made: with no dashboard it is never used.
            'nevela.auth.web_url' => 'http://localhost:3000',
            'nevela.auth.proxy_secret' => null,
        ]);
        Cache::forever(DeployCheckCommand::HEARTBEAT, time() - 120);
        Access::grant(User::factory()->create(['email' => 'owner@example.com']), 'ADMIN');

        Artisan::call('nevela:deploy:check');
        $output = preg_replace('/\s+/', ' ', Artisan::output());

        $this->assertStringContainsString('none (NEVELA_DASHBOARD=false)', $output);
        $this->assertStringNotContainsString('NEVELA_WEB_URL', $output);
        $this->assertStringNotContainsString('NEVELA_PROXY_SECRET', $output);
        $this->assertStringNotContainsString('The dashboard', $output);
        $this->assertStringContainsString('Ready', $output);
    }

    public function test_resend_without_its_key_is_named(): void
    {
        config(['mail.default' => 'resend', 'services.resend.key' => null]);

        Artisan::call('nevela:deploy:check', ['--no-dashboard' => true]);

        $this->assertStringContainsString('no RESEND_API_KEY', preg_replace('/\s+/', ' ', Artisan::output()));
    }

    public function test_the_bell_does_not_warn_about_email_links_there_are_none_of(): void
    {
        $admin = User::factory()->create();
        Access::grant($admin, 'ADMIN');
        $this->app['env'] = 'production';
        config(['nevela.auth.web_url' => 'http://localhost:3000', 'cache.default' => 'database']);
        Conditions::forget();
        Sanctum::actingAs($admin);

        $ids = array_column($this->getJson('/api/_nevela/notifications')->assertOk()->json('conditions'), 'id');
        $this->assertNotContains('web-url', $ids);
    }

    public function test_status_says_there_is_no_dashboard(): void
    {
        config(['nevela.web_path' => base_path('no-such-folder'), 'nevela.mobile_path' => null]);

        Artisan::call('nevela:status');

        $this->assertStringContainsString('none: an API and a mobile app', preg_replace('/\s+/', ' ', Artisan::output()));
    }
}
