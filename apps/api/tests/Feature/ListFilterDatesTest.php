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
 * Ranges on a date field, saved as the app saves it, on whichever database the tests are
 * on; and what the public list of the same records may not be asked.
 */
class ListFilterDatesTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn (): array => [Descriptor::fromArray([
            'name' => 'Gig',
            'fields' => ['name' => ['kind' => 'string'], 'day' => ['kind' => 'date']],
            'public' => ['read' => ['fields' => ['name', 'day']]],
        ])]);
        Access::reset();
        Permissions::forget();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        foreach (['Opening' => '2026-11-01', 'Middle' => '2026-11-15', 'Closing' => '2026-11-30', 'Encore' => '2026-12-01'] as $name => $day) {
            $this->postJson('/api/gigs', ['name' => $name, 'day' => $day])->assertCreated();
        }
    }

    protected function tearDown(): void
    {
        Nevela::forget();
        parent::tearDown();
    }

    /** @return list<string> */
    private function names(string $query, string $list = '/api/gigs'): array
    {
        return $this->getJson("{$list}?sort=day&{$query}")->assertOk()->json('data.*.name');
    }

    public function test_a_date_range_takes_in_both_ends(): void
    {
        $this->assertSame(['Opening', 'Middle', 'Closing'], $this->names('filter[day][between]=2026-11-01,2026-11-30'));
        $this->assertSame(['Closing', 'Encore'], $this->names('filter[day][gt]=2026-11-15'));
        $this->assertSame(['Opening', 'Middle'], $this->names('filter[day][lt]=2026-11-30'));
    }

    public function test_the_public_list_takes_its_fields_operators_but_not_when_a_record_was_made(): void
    {
        // Its records are none until the app's scopePublicQuery lets some through; the question is allowed.
        $this->getJson('/api/public/gigs?filter[day][gt]=2026-11-15')->assertOk();

        $this->getJson('/api/public/gigs?filter[createdAt][gt]=2026-01-01&filter[updatedAt][lt]=2030-01-01&include=items')
            ->assertStatus(400)
            ->assertJsonPath('issues.*.param', ['filter[createdAt]', 'filter[updatedAt]', 'include']);
    }
}
