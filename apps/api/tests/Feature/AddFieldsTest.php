<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Generator\ResourceGenerator;
use Nevela\Laravel\Nevela;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * Fields added to a table that has records in it, as `nevela field` adds them: the table
 * is made without them, a record put in it, and then the migration the command writes is
 * run, on whichever database the tests are on.
 */
class AddFieldsTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private const ADDED = 'dueDate:date, region:enum(north|south)=north, carrier:belongsTo(Category), urgent:boolean, code:string!, memo:text?';

    private object $migration;

    private string $earlier = '019a0000-0000-7000-8000-000000000001';

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('shipments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->timestamps();
            $table->softDeletes();
        });
        DB::table('shipments')->insert(['id' => $this->earlier, 'name' => 'Earlier', 'created_at' => now(), 'updated_at' => now()]);

        $this->resources(fn (): array => [Descriptor::fromSpec('Shipment', 'name:string, '.self::ADDED)]);
        $added = array_values(array_intersect_key($this->descriptor('Shipment')->fields, Descriptor::fieldsOf(self::ADDED)));
        $this->migration = require $this->file((new ResourceGenerator)->addFieldsMigration($this->descriptor('Shipment'), $added, Nevela::all()));
        $this->migration->up();

        Access::reset();
        Permissions::forget();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
    }

    protected function tearDown(): void
    {
        Nevela::forget();
        parent::tearDown();
    }

    public function test_a_record_from_before_keeps_what_it_has_and_takes_the_defaults(): void
    {
        $this->getJson("/api/shipments/{$this->earlier}")
            ->assertOk()
            ->assertJsonPath('name', 'Earlier')
            ->assertJsonPath('dueDate', null)
            ->assertJsonPath('carrierId', null)
            ->assertJsonPath('region', 'north')
            ->assertJsonPath('urgent', false);
    }

    public function test_the_form_asks_for_what_it_has_not_got_and_a_change_that_leaves_it_out_still_works(): void
    {
        $this->patchJson("/api/shipments/{$this->earlier}", ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('name', 'Renamed');

        $this->putJson("/api/shipments/{$this->earlier}", ['name' => 'Renamed', 'region' => 'south', 'urgent' => true])
            ->assertUnprocessable()
            ->assertJsonFragment(['path' => 'dueDate']);
    }

    public function test_more_than_one_record_can_go_without_a_unique_field(): void
    {
        DB::table('shipments')->insert(['id' => '019a0000-0000-7000-8000-000000000002', 'name' => 'Another', 'created_at' => now(), 'updated_at' => now()]);

        $this->assertSame(2, DB::table('shipments')->whereNull('code')->count());
    }

    public function test_rolled_back_the_columns_are_gone_and_the_records_are_not(): void
    {
        $this->migration->down();

        $this->assertSame(['created_at', 'deleted_at', 'id', 'name', 'updated_at'], collect(Schema::getColumnListing('shipments'))->sort()->values()->all());
        $this->assertSame('Earlier', DB::table('shipments')->value('name'));

        // And it can be run again.
        $this->migration->up();
        $this->assertTrue(Schema::hasColumn('shipments', 'carrier_id'));
    }
}
