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

/** A phone field with no country: any country's real number, and nothing else, kept one way. */
class AnyCountryPhonesTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn (): array => [Descriptor::fromSpec('Caller', 'name:string, phone:tel!, office:tel(GB)?')]);
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

    private function made(string $phone): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/callers', ['name' => 'Ada', 'phone' => $phone]);
    }

    public function test_a_number_from_anywhere_is_kept_one_way(): void
    {
        $this->made('+256 772 123 456')->assertCreated()->assertJsonPath('phone', '+256772123456');
        $this->made('+44 20 7946 0958')->assertCreated()->assertJsonPath('phone', '+442079460958');
        $this->made('0049 30 901820')->assertCreated()->assertJsonPath('phone', '+4930901820');
    }

    public function test_what_is_not_a_number_is_refused_and_says_what_one_is(): void
    {
        foreach (['blue', '+256 12', '12345', '+999 123 456 789'] as $wrong) {
            $this->made($wrong)
                ->assertUnprocessable()
                ->assertJsonPath('issues.0.path', 'phone')
                ->assertJsonPath('issues.0.message', 'Enter a valid phone number, with its country code, such as +256 712 345678.');
        }
    }

    public function test_without_a_country_for_the_app_a_number_needs_its_plus(): void
    {
        $this->made('0772 123456')->assertUnprocessable()->assertJsonPath('issues.0.path', 'phone');
    }

    public function test_with_one_a_number_without_a_plus_is_read_as_that_country_s(): void
    {
        config(['nevela.phone_country' => 'UG']);

        $this->made('0772 123456')->assertCreated()->assertJsonPath('phone', '+256772123456');
        // One that says otherwise is read as what it says.
        $this->made('+44 7400 123456')->assertCreated()->assertJsonPath('phone', '+447400123456');
        $this->made('blue')->assertUnprocessable()->assertJsonPath('issues.0.message', 'Enter a valid phone number, such as 0772 123456 or +256 772 123456. One from another country starts with its code.');
    }

    public function test_two_ways_of_writing_a_number_are_one_number_to_a_unique_field(): void
    {
        config(['nevela.phone_country' => 'UG']);
        $this->made('0772 123456')->assertCreated();

        $this->made('+256 772 123 456')->assertUnprocessable()->assertJsonPath('issues.0.path', 'phone');
        $this->made('256772123456')->assertUnprocessable()->assertJsonPath('issues.0.path', 'phone');
    }

    public function test_a_field_held_to_a_country_takes_that_country_s_only_whatever_the_app_says(): void
    {
        config(['nevela.phone_country' => 'UG']);
        $with = fn (string $office) => $this->postJson('/api/callers', ['name' => 'Ada', 'phone' => '+256772123456', 'office' => $office]);

        $with('07400 123456')->assertCreated()->assertJsonPath('office', '+447400123456');
        Nevela::forget();
        $this->postJson('/api/callers', ['name' => 'Ada', 'phone' => '+256772123457', 'office' => '0772 123456'])
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'office')
            ->assertJsonPath('issues.0.message', 'Enter a number from GB, such as 07400 123456 or +44 7400 123456.');
    }

    public function test_several_at_once_are_kept_and_checked_the_same_way(): void
    {
        $this->postJson('/api/callers/_bulk', ['items' => [
            ['name' => 'A', 'phone' => '+256 772 123 456'],
            ['name' => 'B', 'phone' => '+44 7400 123456'],
        ]])->assertCreated()->assertJsonPath('data.0.phone', '+256772123456')->assertJsonPath('data.1.phone', '+447400123456');

        $this->postJson('/api/callers/_bulk', ['items' => [['name' => 'C', 'phone' => 'blue']]])
            ->assertUnprocessable()
            ->assertJsonPath('rows.0.issues.0.path', 'phone');

        // The same number twice, written two ways.
        $this->postJson('/api/callers/_bulk', ['items' => [
            ['name' => 'D', 'phone' => '+49 30 901820'],
            ['name' => 'E', 'phone' => '004930901820'],
        ]])->assertUnprocessable()->assertJsonPath('rows.0.row', 2)->assertJsonPath('rows.0.issues.0.path', 'phone');
    }

    public function test_a_seeded_number_is_a_real_one_that_can_be_saved_back(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Caller', '--count' => 25])->assertSuccessful();

        foreach (\App\Models\Caller::query()->get() as $caller) {
            $this->patchJson("/api/callers/{$caller->id}", ['phone' => $caller->phone])->assertOk()->assertJsonPath('phone', $caller->phone);
        }
    }
}
