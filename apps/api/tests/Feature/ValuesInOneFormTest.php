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

/** Values checked and kept one way, however they arrive: one record, several, or a change. */
class ValuesInOneFormTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    /** @var array<string, mixed> */
    private array $supplier = ['name' => 'Acme', 'site' => 'https://acme.example', 'tint' => '#112233', 'stars' => 3];

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn (): array => [Descriptor::fromSpec('Supplier', 'name:string, contact:email!, site:url, tint:color, stars:rating, score:rating(10)?, grade:rating?')]);
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

    public function test_an_email_is_kept_in_small_letters_and_is_one_address_however_it_is_written(): void
    {
        $this->postJson('/api/suppliers', ['contact' => ' Ada.Nakato@Example.COM '] + $this->supplier)
            ->assertCreated()
            ->assertJsonPath('contact', 'ada.nakato@example.com');

        $this->postJson('/api/suppliers', ['contact' => 'ada.nakato@example.com'] + $this->supplier)
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'contact');
        $this->postJson('/api/suppliers', ['contact' => 'ADA.NAKATO@EXAMPLE.COM'] + $this->supplier)
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'contact');
    }

    public function test_a_colour_is_kept_as_six_small_digits(): void
    {
        $made = fn (string $tint, string $contact) => $this->postJson('/api/suppliers', ['contact' => $contact, 'tint' => $tint] + $this->supplier);

        $made('#ABC', 'a@example.com')->assertCreated()->assertJsonPath('tint', '#aabbcc');
        $made('#ABCDEF', 'b@example.com')->assertCreated()->assertJsonPath('tint', '#abcdef');
        $made('blue', 'c@example.com')->assertUnprocessable()->assertJsonPath('issues.0.path', 'tint');
        $made('#ABCD', 'd@example.com')->assertUnprocessable()->assertJsonPath('issues.0.path', 'tint');
    }

    public function test_a_website_is_http_or_https(): void
    {
        $made = fn (string $site, string $contact) => $this->postJson('/api/suppliers', ['contact' => $contact, 'site' => $site] + $this->supplier);

        $made('http://acme.example', 'a@example.com')->assertCreated();
        $made('https://acme.example/about', 'b@example.com')->assertCreated();
        foreach (['ftp://acme.example', 'javascript:alert(1)', 'mailto:a@acme.example', 'acme.example'] as $site) {
            $made($site, 'c@example.com')->assertUnprocessable()->assertJsonPath('issues.0.path', 'site');
        }
    }

    public function test_a_rating_is_from_one_to_its_most(): void
    {
        $made = fn (array $rating, string $contact) => $this->postJson('/api/suppliers', ['contact' => $contact] + $rating + $this->supplier);

        foreach ([0, 6, 99, -1] as $n => $stars) {
            $made(['stars' => $stars], "stars{$n}@example.com")->assertUnprocessable()->assertJsonPath('issues.0.path', 'stars');
        }
        $made(['stars' => 5], 'five@example.com')->assertCreated();
        $made(['score' => 10], 'ten@example.com')->assertCreated()->assertJsonPath('score', 10);
        $made(['score' => 11], 'eleven@example.com')->assertUnprocessable()->assertJsonPath('issues.0.path', 'score');
        $made(['grade' => null], 'none@example.com')->assertCreated()->assertJsonPath('grade', null);
    }

    public function test_a_change_and_several_at_once_are_kept_the_same_way(): void
    {
        $id = $this->postJson('/api/suppliers', ['contact' => 'a@example.com'] + $this->supplier)->assertCreated()->json('id');

        $this->patchJson("/api/suppliers/{$id}", ['contact' => 'New@Example.COM', 'tint' => '#FFF'])
            ->assertOk()
            ->assertJsonPath('contact', 'new@example.com')
            ->assertJsonPath('tint', '#ffffff');

        $this->postJson('/api/suppliers/_bulk', ['items' => [
            ['contact' => 'Two@Example.COM', 'tint' => '#ABC'] + $this->supplier,
        ]])->assertCreated()->assertJsonPath('data.0.contact', 'two@example.com')->assertJsonPath('data.0.tint', '#aabbcc');

        // Two rows that are one address once they are in their form.
        $this->postJson('/api/suppliers/_bulk', ['items' => [
            ['contact' => 'Same@Example.COM'] + $this->supplier,
            ['contact' => 'same@example.com'] + $this->supplier,
        ]])->assertUnprocessable()->assertJsonPath('rows.0.row', 2)->assertJsonPath('rows.0.issues.0.path', 'contact');
    }
}
