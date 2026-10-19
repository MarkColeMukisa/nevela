<?php

namespace Tests\Feature;

use App\Models\Gadget;
use App\Models\User;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Database\Events\MigrationsStarted;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Support\Descriptor;
use Nevela\Laravel\Support\SchemaFacts;
use ReflectionProperty;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\NullOutput;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * Which tables and columns are there, remembered across requests once the answer is yes.
 *
 * Under PHP-FPM every request starts with nothing in memory. These tests make that
 * happen between requests (forgetting what this process holds) and check that the
 * schema is not asked again, which the benchmark found it was, twice on every read.
 */
class SchemaFactsTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

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
        SchemaFacts::$persistInTests = false;
        Schema::dropIfExists('later');
        parent::tearDown();
    }

    /** What a new PHP-FPM request has: nothing this process worked out. */
    private function newRequest(): void
    {
        (new ReflectionProperty(SchemaFacts::class, 'known'))->setValue(null, null);
        (new ReflectionProperty(Gadget::class, 'hasTrash'))->setValue(null, false);
        Access::forget();
    }

    /** @return list<string> The queries that asked about the schema while $run ran. */
    private function schemaQueries(callable $run): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $run();
        DB::disableQueryLog();

        return array_values(array_filter(array_column(DB::getQueryLog(), 'query'), fn (string $sql) => (bool) preg_match('/sqlite_master|pragma_table|information_schema|pg_catalog|pg_class|pg_attribute|pg_namespace/i', $sql)));
    }

    public function test_a_read_after_the_first_asks_nothing_about_the_schema(): void
    {
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        Gadget::query()->create(['name' => 'Kettle']);

        $this->newRequest();
        $first = $this->schemaQueries(fn () => $this->getJson('/api/gadgets')->assertOk()->assertJsonPath('meta.total', 1));
        $this->assertNotEmpty($first, 'the first request finds out');

        $this->newRequest();
        $this->assertSame([], $this->schemaQueries(fn () => $this->getJson('/api/gadgets')->assertOk()->assertJsonPath('meta.total', 1)));

        // And the trash still works: deleted, it is gone from the list.
        Gadget::query()->firstOrFail()->delete();
        $this->newRequest();
        $this->getJson('/api/gadgets')->assertOk()->assertJsonPath('meta.total', 0);
        $this->assertSame(1, Gadget::withTrashed()->count());
    }

    public function test_only_a_yes_is_kept(): void
    {
        $this->assertFalse(SchemaFacts::hasTable('later'));
        $this->assertFileDoesNotExist(SchemaFacts::path());

        // The table arrives (a migration), and the next question finds it.
        Schema::create('later', fn (Blueprint $table) => $table->id());
        $this->assertTrue(SchemaFacts::hasTable('later'));
        $this->assertFalse(SchemaFacts::hasColumn('later', 'deleted_at'));

        $this->newRequest();
        $saved = json_decode((string) file_get_contents(SchemaFacts::path()), true);
        $this->assertSame([DB::connection()->getName().':'.DB::connection()->getDatabaseName().':later'], array_keys($saved));
        $this->assertSame([], $this->schemaQueries(fn () => $this->assertTrue(SchemaFacts::hasTable('later'))));
    }

    public function test_migrations_and_optimize_clear_forget(): void
    {
        $this->assertTrue(SchemaFacts::hasTable('users'));
        $this->assertFileExists(SchemaFacts::path());

        event(new MigrationsStarted('up'));
        $this->assertFileDoesNotExist(SchemaFacts::path());
        $this->assertNotEmpty($this->schemaQueries(fn () => SchemaFacts::hasTable('users')), 'asked again');

        $this->assertFileExists(SchemaFacts::path());
        event(new CommandStarting('optimize:clear', new ArrayInput([]), new NullOutput));
        $this->assertFileDoesNotExist(SchemaFacts::path());
    }

    public function test_tests_keep_no_file_unless_asked(): void
    {
        SchemaFacts::$persistInTests = false;
        $this->assertTrue(SchemaFacts::hasTable('users'));
        $this->assertFileDoesNotExist(SchemaFacts::path());
    }
}
