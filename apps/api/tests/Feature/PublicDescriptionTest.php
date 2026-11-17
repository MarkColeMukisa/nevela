<?php

namespace Tests\Feature;

use App\Models\Snack;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * What anyone may read, described for a client that isn't signed in: the mobile app opens
 * on a shop for a guest from it. Only what is public is there, and nothing of the order.
 */
class PublicDescriptionTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->resources(fn () => [
            Descriptor::fromArray([
                'name' => 'Basket',
                'items' => 'Unit',
                'owner' => 'email',
                'fields' => ['customer' => ['kind' => 'string'], 'email' => ['kind' => 'string', 'format' => 'email', 'required' => false]],
            ]),
            Descriptor::fromArray([
                'name' => 'Snack',
                'titleField' => 'name',
                'fields' => [
                    'name' => ['kind' => 'string'],
                    'price' => ['kind' => 'float', 'format' => 'money'],
                    'cost' => ['kind' => 'float', 'format' => 'money'],
                    'shelf' => ['kind' => 'enum', 'options' => ['front', 'back'], 'optionLabels' => ['front' => 'At the front']],
                ],
                'public' => ['read' => ['fields' => ['name', 'price', 'shelf'], 'throttle' => '600,1']],
            ]),
            Descriptor::fromArray([
                'name' => 'Unit',
                'fields' => [
                    'basketId' => ['kind' => 'belongsTo', 'target' => 'Basket'],
                    'snackId' => ['kind' => 'belongsTo', 'target' => 'Snack'],
                    'quantity' => ['kind' => 'int'],
                ],
            ]),
        ]);
        config(['nevela.currency' => 'UGX']);
    }

    public function test_only_what_is_public_is_described_and_what_is_sold_says_so(): void
    {
        $data = collect($this->getJson('/api/public/_nevela/resources')->assertOk()->json('data'));

        $snack = $data->firstWhere('name', 'Snack');
        $this->assertNotNull($snack);
        $this->assertTrue($snack['sold']);
        $this->assertTrue($snack['open']);
        $this->assertSame(['name', 'price', 'shelf'], array_keys($snack['fields']));
        $this->assertSame('UGX', $snack['fields']['price']['currency']);
        $this->assertSame(['front' => 'At the front'], $snack['fields']['shelf']['optionLabels']);

        // The order, its lines and anything without a public side are not there at all.
        foreach (['Basket', 'Unit', 'Order', 'OrderItem', 'Product', 'Category'] as $hidden) {
            $this->assertNull($data->firstWhere('name', $hidden), "{$hidden} is described to anyone");
        }
        $this->assertStringNotContainsString('cost', json_encode($snack));
        $this->assertStringNotContainsString('email', $this->getJson('/api/public/_nevela/resources')->getContent());
    }

    public function test_it_needs_no_sign_in_and_a_public_list_reads_only_what_is_open(): void
    {
        Snack::query()->create(['name' => 'Chapati', 'price' => 1000, 'cost' => 400, 'shelf' => 'front']);

        $this->getJson('/api/public/_nevela/resources')->assertOk();
        // The signed-in description stays shut.
        $this->getJson('/api/_nevela/resources')->assertUnauthorized();
    }
}
