<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/** GET _nevela/resources: the resources as a client, such as the mobile app, draws its screens from them. */
class ResourcesEndpointTest extends TestCase
{
    use RefreshDatabase;

    /** The money field of the repository's Product, as the endpoint describes it. */
    private function price(): array
    {
        Access::reset();
        Sanctum::actingAs(User::factory()->create());
        $products = collect($this->getJson('/api/_nevela/resources')->assertOk()->json('data'))->firstWhere('name', 'Product');

        return $products['fields']['price'];
    }

    public function test_money_carries_the_apps_currency_so_a_phone_writes_it_as_the_dashboard_does(): void
    {
        config(['nevela.currency' => 'UGX']);

        $price = $this->price();

        $this->assertSame('money', $price['format']);
        $this->assertSame('UGX', $price['currency']);
    }

    public function test_without_an_app_currency_money_names_none(): void
    {
        config(['nevela.currency' => null]);

        $this->assertArrayNotHasKey('currency', $this->price());
    }
}
