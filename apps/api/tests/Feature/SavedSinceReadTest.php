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
 * Two people editing the same record: a change sent with the updatedAt it was read with
 * is refused once someone else has saved, instead of quietly putting their change back.
 */
class SavedSinceReadTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn (): array => [Descriptor::fromArray([
            'name' => 'Deal',
            'fields' => [
                'name' => ['kind' => 'string'],
                'stage' => ['kind' => 'enum', 'options' => ['new', 'won'], 'default' => 'new'],
            ],
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

    /** @return array{string, string} The deal's id, and the updatedAt it was read with. */
    private function readDeal(): array
    {
        $deal = $this->postJson('/api/deals', ['name' => 'Kettles'])->assertCreated()->json();

        return [$deal['id'], $deal['updatedAt']];
    }

    public function test_a_change_read_before_someone_else_saved_is_refused_with_the_record_as_it_is(): void
    {
        [$id, $read] = $this->readDeal();
        $this->travel(5)->seconds();
        $theirs = $this->patchJson("/api/deals/{$id}", ['stage' => 'won'])->assertOk()->json('updatedAt');

        $this->patchJson("/api/deals/{$id}", ['name' => 'Kettles and pans', 'stage' => 'new', 'updatedAt' => $read])
            ->assertStatus(409)
            ->assertJsonPath('code', 'CHANGED_SINCE_READ')
            ->assertJsonPath('error', 'Someone else saved this deal after you read it, so nothing was changed. Send your change again with the updatedAt it has now.')
            ->assertJsonPath('current.stage', 'won')
            ->assertJsonPath('current.updatedAt', $theirs);
        $this->getJson("/api/deals/{$id}")->assertJsonPath('name', 'Kettles')->assertJsonPath('stage', 'won');

        // Sent again with the updatedAt it has now, it is made.
        $this->patchJson("/api/deals/{$id}", ['name' => 'Kettles and pans', 'updatedAt' => $theirs])->assertOk()->assertJsonPath('name', 'Kettles and pans');
    }

    public function test_a_replace_is_held_to_it_too(): void
    {
        [$id, $read] = $this->readDeal();
        $this->travel(5)->seconds();
        $this->patchJson("/api/deals/{$id}", ['stage' => 'won'])->assertOk();

        $this->putJson("/api/deals/{$id}", ['name' => 'Kettles', 'stage' => 'new', 'updatedAt' => $read])->assertStatus(409);
    }

    public function test_a_change_read_after_the_last_save_is_made(): void
    {
        [$id, $read] = $this->readDeal();
        $this->travel(5)->seconds();

        $this->patchJson("/api/deals/{$id}", ['stage' => 'won', 'updatedAt' => $read])->assertOk()->assertJsonPath('stage', 'won');
    }

    public function test_a_change_without_updated_at_is_made_regardless(): void
    {
        [$id] = $this->readDeal();
        $this->travel(5)->seconds();
        $this->patchJson("/api/deals/{$id}", ['stage' => 'won'])->assertOk();

        $this->patchJson("/api/deals/{$id}", ['name' => 'Pans'])->assertOk()->assertJsonPath('name', 'Pans');
    }

    public function test_an_updated_at_that_is_not_a_time_is_refused(): void
    {
        [$id] = $this->readDeal();

        $this->patchJson("/api/deals/{$id}", ['name' => 'Pans', 'updatedAt' => 'yesterday-ish'])->assertUnprocessable()->assertJsonPath('issues.0.path', 'updatedAt');
        $this->patchJson("/api/deals/{$id}", ['name' => 'Pans', 'updatedAt' => 12])->assertUnprocessable()->assertJsonPath('issues.0.path', 'updatedAt');
    }

    public function test_someone_who_may_not_change_it_learns_nothing_about_who_did(): void
    {
        [$id, $read] = $this->readDeal();
        $this->travel(5)->seconds();
        $this->patchJson("/api/deals/{$id}", ['stage' => 'won'])->assertOk();

        Sanctum::actingAs(User::factory()->create());
        $this->patchJson("/api/deals/{$id}", ['name' => 'Pans', 'updatedAt' => $read])->assertForbidden();
    }
}
