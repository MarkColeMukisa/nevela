<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Nevela;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * Fields that go together once only, one of them left out and so its default. What will
 * be saved is what is checked: refused with a message, and not by the database.
 */
class SetsWithDefaultsTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn (): array => [Descriptor::fromArray([
            'name' => 'Seat',
            'fields' => [
                'room' => ['kind' => 'string'],
                'vip' => ['kind' => 'boolean'],
                'floor' => ['kind' => 'string'],
                'tier' => ['kind' => 'enum', 'options' => ['a', 'b'], 'default' => 'a'],
            ],
            'unique' => [['room', 'vip'], ['floor', 'tier']],
        ])]);
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

    public function test_a_yes_or_no_left_out_is_checked_as_false(): void
    {
        $this->postJson('/api/seats', ['room' => 'A', 'floor' => '1'])->assertCreated()->assertJsonPath('vip', false);

        $this->postJson('/api/seats', ['room' => 'A', 'floor' => '2'])
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'room');
        $this->postJson('/api/seats', ['room' => 'A', 'floor' => '2', 'vip' => true])->assertCreated();
    }

    public function test_a_default_left_out_is_checked_as_its_default(): void
    {
        $this->postJson('/api/seats', ['room' => 'A', 'floor' => '1'])->assertCreated()->assertJsonPath('tier', 'a');

        $this->postJson('/api/seats', ['room' => 'B', 'floor' => '1'])
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'floor');
        $this->postJson('/api/seats', ['room' => 'B', 'floor' => '1', 'tier' => 'b'])->assertCreated();
    }

    public function test_a_replace_is_checked_as_it_will_be_saved_and_a_patch_with_what_the_record_has(): void
    {
        $this->postJson('/api/seats', ['room' => 'A', 'floor' => '1'])->assertCreated();
        $vip = $this->postJson('/api/seats', ['room' => 'A', 'floor' => '2', 'vip' => true])->assertCreated()->json('id');

        // Left out of a replace, vip is false, and there is already a seat in A that isn't.
        $this->putJson("/api/seats/{$vip}", ['room' => 'A', 'floor' => '2'])->assertUnprocessable()->assertJsonPath('issues.0.path', 'room');
        // Left out of a patch, it stays true.
        $this->patchJson("/api/seats/{$vip}", ['room' => 'A'])->assertOk()->assertJsonPath('vip', true);
    }

    public function test_two_rows_of_a_batch_are_checked_against_each_other_and_what_is_there(): void
    {
        $this->postJson('/api/seats/_bulk', ['items' => [['room' => 'A', 'floor' => '1'], ['room' => 'A', 'floor' => '2']]])
            ->assertUnprocessable()
            ->assertJsonPath('rows.0.row', 2)
            ->assertJsonPath('rows.0.issues.0.path', 'room')
            ->assertJsonPath('rows.0.issues.0.message', 'The same as row 1. Each one needs its own.');

        $this->postJson('/api/seats', ['room' => 'B', 'floor' => '3'])->assertCreated();
        $this->postJson('/api/seats/_bulk', ['items' => [['room' => 'B', 'floor' => '4']]])->assertUnprocessable();
    }
}
