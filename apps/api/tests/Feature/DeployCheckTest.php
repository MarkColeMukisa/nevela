<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Console\DeployCheckCommand;
use Nevela\Laravel\Support\QueueProbe;
use Tests\TestCase;

/**
 * `nevela deploy:check`: what a deployed app needs and a local one doesn't, each problem
 * named with what to change. Kian Rover's first deploy to Laravel Cloud found them one by one.
 */
class DeployCheckTest extends TestCase
{
    use RefreshDatabase;

    private const HEALTH = 'https://app.example.com/api/nevela/health';

    /** What the dashboard answers, made fresh for each request. Http::fake keeps its first stub for an address, so one stub reads this. */
    private \Closure $dashboard;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
    }

    /** A server set up as it should be. Each test spoils one part. */
    private function wellSetUp(): void
    {
        $this->app['env'] = 'production';
        config([
            'app.debug' => false,
            'cache.default' => 'file',
            'queue.default' => 'sync',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => 'smtp.example.com',
            'mail.from.address' => 'hello@kianrover.com',
            'nevela.auth.web_url' => 'https://app.example.com',
            'nevela.auth.proxy_secret' => 'the-shared-secret',
        ]);
        Cache::forever(DeployCheckCommand::HEARTBEAT, time() - 120);
        Access::grant(User::factory()->create(['email' => 'owner@example.com']), 'ADMIN');
        $this->dashboard = fn () => Http::response(['nevela' => 'dashboard', 'problems' => [], 'siteUrl' => 'https://app.example.com']);
        Http::fake([self::HEALTH => fn () => ($this->dashboard)()]);
    }

    protected function tearDown(): void
    {
        Cache::forget(DeployCheckCommand::HEARTBEAT);
        parent::tearDown();
    }

    public function test_a_server_set_up_as_it_should_be_is_ready(): void
    {
        $this->wellSetUp();

        $this->artisan('nevela:deploy:check')
            ->expectsOutputToContain('owner@example.com')
            ->expectsOutputToContain('ran 2 min ago')
            ->expectsOutputToContain('the secret matches')
            ->expectsOutputToContain('Ready')
            ->assertSuccessful();

        // The dashboard was asked with the secret, which is what lets it answer.
        Http::assertSent(fn ($request) => $request->url() === self::HEALTH && $request->hasHeader('X-Nevela-Proxy-Secret', 'the-shared-secret'));
    }

    public function test_each_thing_a_server_lacks_is_named_with_what_to_change(): void
    {
        $this->wellSetUp();
        config([
            'app.debug' => true,
            'cache.default' => 'array',
            'mail.default' => 'log',
            'nevela.auth.web_url' => 'http://localhost:3000',
            'nevela.auth.proxy_secret' => null,
        ]);
        Cache::forget(DeployCheckCommand::HEARTBEAT);
        User::query()->delete();

        $this->artisan('nevela:deploy:check', ['--no-dashboard' => true])
            ->expectsOutputToContain('APP_DEBUG=false')
            ->expectsOutputToContain('CACHE_STORE=database or redis')
            ->expectsOutputToContain('switch on the scheduler')
            ->expectsOutputToContain('never arrive')
            ->expectsOutputToContain("set it to the dashboard's address")
            ->expectsOutputToContain('Set the same value in both apps')
            ->expectsOutputToContain('nevela:user --role=ADMIN')
            ->assertFailed();
    }

    public function test_a_queue_with_no_worker_is_found_out_and_a_worker_is_seen(): void
    {
        $this->wellSetUp();
        config(['queue.default' => 'database']);

        $this->artisan('nevela:deploy:check', ['--wait' => 0, '--no-dashboard' => true])
            ->expectsOutputToContain('none took a test job on database')
            ->assertFailed();

        // The job it left behind is harmless: a worker that comes along only notes that it ran.
        Artisan::call('queue:work', ['connection' => 'database', '--once' => true]);
        $this->assertSame(0, \Illuminate\Support\Facades\DB::table('jobs')->count());

        // The same job, taken by a worker, is what the command waits to see.
        app('queue')->connection('database')->push(new QueueProbe('seen'));
        Artisan::call('queue:work', ['connection' => 'database', '--once' => true]);
        $this->assertTrue(Cache::get(QueueProbe::key('seen')));
    }

    public function test_the_dashboard_says_what_it_sees(): void
    {
        $this->wellSetUp();

        $answers = [
            'its secret is another' => [fn () => Http::response(['code' => 'SECRET_DIFFERS'], 403), "isn't this app's"],
            'it has none' => [fn () => Http::response(['code' => 'NO_SECRET'], 403), 'has no NEVELA_PROXY_SECRET'],
            'it can\'t reach the API' => [fn () => Http::response(['nevela' => 'dashboard', 'problems' => ['NEVELA_API_URL is https://x.laravel.cloud. Nevela\'s routes are under /api: set it to https://x.laravel.cloud/api.'], 'siteUrl' => 'https://app.example.com']), 'set it to https://x.laravel.cloud/api'],
            'it is something else' => [fn () => Http::response('<html>', 404), 'not as a Nevela dashboard'],
            'nothing answers' => [fn () => throw new ConnectionException('refused'), "can't reach https://app.example.com"],
        ];
        foreach ($answers as $case => [$answer, $said]) {
            $this->dashboard = $answer;
            $this->artisan('nevela:deploy:check')->expectsOutputToContain($said)->assertFailed();
        }

        // Its site address differs from NEVELA_WEB_URL: worth saying, not a failure.
        $this->dashboard = fn () => Http::response(['nevela' => 'dashboard', 'problems' => [], 'siteUrl' => 'https://x.laravel.cloud']);
        $this->artisan('nevela:deploy:check')->expectsOutputToContain('NEXT_PUBLIC_SITE_URL is https://x.laravel.cloud')->assertSuccessful();
    }

    public function test_the_scheduler_leaves_a_sign_every_five_minutes(): void
    {
        $event = collect(app(Schedule::class)->events())->first(fn ($event) => $event->description === 'nevela:heartbeat');
        $this->assertNotNull($event);
        $this->assertSame('*/5 * * * *', $event->expression);

        config(['cache.default' => 'file']);
        $event->run($this->app);
        $this->assertEqualsWithDelta(time(), Cache::get(DeployCheckCommand::HEARTBEAT), 5);
    }
}
