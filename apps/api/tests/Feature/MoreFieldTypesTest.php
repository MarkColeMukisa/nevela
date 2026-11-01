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

/** A domain, a country, a time and JSON, over HTTP, on whichever database the tests are on. */
class MoreFieldTypesTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn (): array => [Descriptor::fromSpec('Venue', 'name:string, site:domain!, land:country(UG), opens:time?, extra:json?')]);
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

    public function test_what_is_sent_is_kept_in_its_one_form(): void
    {
        $this->postJson('/api/venues', [
            'name' => 'Hall',
            'site' => 'https://Example.COM/about',
            'land' => 'ke',
            'opens' => '9:05',
            'extra' => ['plan' => 'pro', 'seats' => 40],
        ])
            ->assertCreated()
            ->assertJsonPath('site', 'example.com')
            ->assertJsonPath('land', 'KE')
            ->assertJsonPath('opens', '09:05')
            ->assertJsonPath('extra.plan', 'pro')
            ->assertJsonPath('extra.seats', 40);
    }

    public function test_a_domain_is_one_domain_however_it_is_written(): void
    {
        $this->postJson('/api/venues', ['name' => 'A', 'site' => 'example.com'])->assertCreated();

        $this->postJson('/api/venues', ['name' => 'B', 'site' => 'https://EXAMPLE.com/'])
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'site');
    }

    public function test_a_country_left_out_is_its_default(): void
    {
        $this->postJson('/api/venues', ['name' => 'A', 'site' => 'a.example.com'])->assertCreated()->assertJsonPath('land', 'UG');
    }

    public function test_what_is_none_of_these_is_refused(): void
    {
        foreach ([
            ['site' => 'localhost'],
            ['site' => 'not a domain'],
            ['land' => 'XX'],
            ['land' => 'Uganda'],
            ['opens' => '25:00'],
            ['opens' => 'noon'],
            ['extra' => 'just text'],
            ['extra' => 5],
        ] as $n => $wrong) {
            $key = array_key_first($wrong);
            $this->postJson('/api/venues', $wrong + ['name' => 'A', 'site' => "ok{$n}.example.com"])
                ->assertUnprocessable()
                ->assertJsonPath('issues.0.path', $key);
        }
    }

    public function test_json_is_read_back_as_it_went_in_and_can_be_changed_and_emptied(): void
    {
        $id = $this->postJson('/api/venues', ['name' => 'A', 'site' => 'a.example.com', 'extra' => ['tags' => ['x', 'y']]])->assertCreated()->json('id');

        $this->getJson("/api/venues/{$id}")->assertOk()->assertJsonPath('extra.tags.1', 'y');
        $this->patchJson("/api/venues/{$id}", ['extra' => [1, 2, 3]])->assertOk()->assertJsonPath('extra.2', 3);
        $this->patchJson("/api/venues/{$id}", ['extra' => null])->assertOk()->assertJsonPath('extra', null);
    }

    public function test_json_cannot_be_sorted_or_filtered_by_and_search_leaves_it_alone(): void
    {
        $this->postJson('/api/venues', ['name' => 'Hall', 'site' => 'a.example.com', 'extra' => ['word' => 'needle']])->assertCreated();

        $this->getJson('/api/venues?sort=extra')->assertStatus(400);
        $this->getJson('/api/venues?filter[extra]=needle')->assertStatus(400);
        $this->getJson('/api/venues?q=needle')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/venues?q=example')->assertOk()->assertJsonPath('meta.total', 1);
    }

    public function test_json_written_as_text_is_read_as_what_it_says_as_a_file_being_imported_has_it(): void
    {
        $this->postJson('/api/venues', ['name' => 'A', 'site' => 'a.example.com', 'extra' => '{"plan":"pro"}'])
            ->assertCreated()
            ->assertJsonPath('extra.plan', 'pro');

        $this->postJson('/api/venues/_bulk', ['items' => [['name' => 'B', 'site' => 'b.example.com', 'extra' => '["x","y"]']]])
            ->assertCreated()
            ->assertJsonPath('data.0.extra.1', 'y');

        $this->postJson('/api/venues', ['name' => 'C', 'site' => 'c.example.com', 'extra' => '{not json'])
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'extra');
    }

    public function test_several_at_once_are_kept_the_same_way(): void
    {
        $this->postJson('/api/venues/_bulk', ['items' => [
            ['name' => 'A', 'site' => 'https://One.example.com/', 'land' => 'rw', 'opens' => '7:30'],
            ['name' => 'B', 'site' => 'two.example.com'],
        ]])
            ->assertCreated()
            ->assertJsonPath('data.0.site', 'one.example.com')
            ->assertJsonPath('data.0.land', 'RW')
            ->assertJsonPath('data.0.opens', '07:30')
            ->assertJsonPath('data.1.land', 'UG');
    }
}
