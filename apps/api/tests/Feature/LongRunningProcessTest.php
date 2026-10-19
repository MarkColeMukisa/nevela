<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Media\Uploads;
use Nevela\Laravel\Support\Descriptor;
use Nevela\Laravel\Support\SchemaFacts;
use ReflectionProperty;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * Octane and queue workers keep one app for many requests, where PHP-FPM starts each
 * afresh. A test process is the same: one app, request after request. Octane's
 * RequestReceived event is dispatched by name, as Octane would, without Octane installed.
 */
class LongRunningProcessTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private const REQUEST_RECEIVED = 'Laravel\Octane\Events\RequestReceived';

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        SchemaFacts::$persistInTests = true;
        SchemaFacts::forget();
        $this->resources(fn () => [
            Descriptor::fromArray(['name' => 'Gadget', 'fields' => ['name' => ['kind' => 'string']]]),
        ]);
    }

    protected function tearDown(): void
    {
        SchemaFacts::forget();
        @unlink(SchemaFacts::path().'.lock');
        SchemaFacts::$persistInTests = false;
        parent::tearDown();
    }

    public function test_one_persons_roles_are_not_anothers_in_the_next_request(): void
    {
        $admin = User::factory()->create();
        Access::grant($admin, 'ADMIN');
        $nobody = User::factory()->create();

        Sanctum::actingAs($admin);
        $this->getJson('/api/gadgets')->assertOk();

        event(self::REQUEST_RECEIVED);
        Sanctum::actingAs($nobody);
        $this->getJson('/api/gadgets')->assertForbidden();
    }

    public function test_a_schema_another_process_forgot_is_asked_about_in_the_next_request(): void
    {
        $this->assertTrue(SchemaFacts::hasTable('gadgets'));
        $this->assertFileExists(SchemaFacts::path());

        // Another process (a migration from the deploy script) clears the file.
        unlink(SchemaFacts::path());

        // This worker, within the same request, still knows.
        $this->assertSame(0, $this->schemaQueries(fn () => SchemaFacts::hasTable('gadgets')));

        // From the next request on, it asks again.
        event(self::REQUEST_RECEIVED);
        $this->assertGreaterThan(0, $this->schemaQueries(fn () => SchemaFacts::hasTable('gadgets')));
    }

    public function test_the_uploads_one_request_looked_up_are_let_go_of(): void
    {
        $loaded = new ReflectionProperty(Uploads::class, 'loaded');
        $loaded->setValue(null, ['some-key' => null]);

        event(self::REQUEST_RECEIVED);
        $this->assertSame([], $loaded->getValue());
    }

    public function test_a_queued_job_starts_like_a_request(): void
    {
        $loaded = new ReflectionProperty(Uploads::class, 'loaded');
        $loaded->setValue(null, ['some-key' => null]);

        event(new \Illuminate\Queue\Events\JobProcessing('database', $this->createMock(\Illuminate\Contracts\Queue\Job::class)));
        $this->assertSame([], $loaded->getValue());
    }

    private function schemaQueries(callable $run): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $run();
        DB::disableQueryLog();

        return count(array_filter(array_column(DB::getQueryLog(), 'query'), fn (string $sql) => (bool) preg_match('/sqlite_master|pragma_table|information_schema|pg_catalog|pg_class|pg_attribute|pg_namespace/i', $sql)));
    }
}
