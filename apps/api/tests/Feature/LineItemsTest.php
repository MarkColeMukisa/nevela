<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Nevela;
use Tests\TestCase;

/**
 * An order and its lines, over HTTP: the lines are sent as "items" with the order,
 * checked by OrderItem's own rules, saved with it or not at all, and deleted and
 * restored with it.
 */
class LineItemsTest extends TestCase
{
    use RefreshDatabase;

    private Product $kettle;

    private Product $mug;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $category = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
        $this->kettle = Product::create(['name' => 'Kettle', 'sku' => 'KET-1', 'price' => 49.5, 'category_id' => $category->id, 'active' => true, 'kind' => 'stock']);
        $this->mug = Product::create(['name' => 'Mug', 'sku' => 'MUG-1', 'price' => 8, 'category_id' => $category->id, 'active' => true, 'kind' => 'stock']);
    }

    /** @param list<array<string, mixed>> $items */
    private function order(array $items, array $overrides = []): array
    {
        return $overrides + ['number' => 'ORD-'.fake()->unique()->numerify('####'), 'customer' => 'Ada', 'status' => 'pending', 'items' => $items];
    }

    public function test_an_order_is_created_with_its_lines_in_the_order_they_were_sent(): void
    {
        $response = $this->postJson('/api/orders', $this->order([
            ['productId' => $this->kettle->id, 'quantity' => 1, 'price' => 49.5],
            ['productId' => $this->mug->id, 'quantity' => 4, 'price' => 8],
        ]))->assertCreated();

        $items = $response->json('items');
        $this->assertCount(2, $items);
        $this->assertSame([$this->kettle->id, $this->mug->id], array_column($items, 'productId'));
        $this->assertSame($response->json('id'), $items[0]['orderId']);
        // Order::itemsSaved() works the total out from the lines.
        $this->assertEquals(81.5, $response->json('total'));
    }

    public function test_one_order_has_its_lines_and_a_list_of_orders_does_not(): void
    {
        $id = $this->postJson('/api/orders', $this->order([['productId' => $this->kettle->id, 'quantity' => 2, 'price' => 49.5]]))->json('id');

        $this->getJson("/api/orders/{$id}")->assertOk()->assertJsonCount(1, 'items');
        $this->assertArrayNotHasKey('items', $this->getJson('/api/orders')->json('data.0'));
    }

    public function test_a_save_changes_the_lines_sent_with_an_id_adds_the_rest_and_removes_those_left_out(): void
    {
        $created = $this->postJson('/api/orders', $this->order([
            ['productId' => $this->kettle->id, 'quantity' => 1, 'price' => 49.5],
            ['productId' => $this->mug->id, 'quantity' => 4, 'price' => 8],
        ]))->json();
        [$kettle, $mug] = $created['items'];

        // A client that echoes what it was given, orderId and all, is not refused for it.
        $kettle['quantity'] = 3;
        $response = $this->patchJson("/api/orders/{$created['id']}", ['items' => [
            $kettle,
            ['productId' => $this->mug->id, 'quantity' => 1, 'price' => 7.5],
        ]])->assertOk();

        $items = $response->json('items');
        $this->assertCount(2, $items);
        $this->assertSame($kettle['id'], $items[0]['id']);
        $this->assertSame(3, $items[0]['quantity']);
        $this->assertNotSame($mug['id'], $items[1]['id']);
        // Left out: gone for good, not in the trash.
        $this->assertNull(OrderItem::withTrashed()->find($mug['id']));
        // The price sent with the new line is not what it costs: the product's is.
        $this->assertEquals(3 * 49.5 + 8, $response->json('total'));
    }

    public function test_a_save_without_items_leaves_the_lines_alone(): void
    {
        $created = $this->postJson('/api/orders', $this->order([['productId' => $this->kettle->id, 'quantity' => 1, 'price' => 49.5]]))->json();

        $this->patchJson("/api/orders/{$created['id']}", ['status' => 'paid'])->assertOk()->assertJsonCount(1, 'items');
        $this->assertSame(1, OrderItem::count());
    }

    public function test_a_wrong_line_is_named_by_its_place_and_nothing_is_saved(): void
    {
        $this->postJson('/api/orders', $this->order([
            ['productId' => $this->kettle->id, 'quantity' => 1, 'price' => 49.5],
            ['productId' => $this->mug->id, 'quantity' => 'lots', 'price' => 8],
        ]))->assertStatus(422)->assertJsonFragment(['path' => 'items.1.quantity']);

        $this->assertSame(0, Order::count());
        $this->assertSame(0, OrderItem::count());
    }

    public function test_a_line_of_another_order_cannot_be_taken_over(): void
    {
        $other = $this->postJson('/api/orders', $this->order([['productId' => $this->kettle->id, 'quantity' => 1, 'price' => 49.5]]))->json();
        $mine = $this->postJson('/api/orders', $this->order([]))->json();

        $this->patchJson("/api/orders/{$mine['id']}", ['items' => [$other['items'][0]]])
            ->assertStatus(422)->assertJsonFragment(['path' => 'items.0.id']);
        $this->assertSame($other['id'], OrderItem::first()->order_id);
    }

    public function test_items_have_to_be_a_list_and_other_resources_take_none(): void
    {
        $this->postJson('/api/orders', ['items' => ['first' => []]] + $this->order([]))
            ->assertStatus(422)->assertJsonFragment(['path' => 'items']);
        $this->postJson('/api/orders', ['items' => 'none'] + $this->order([]))
            ->assertStatus(422)->assertJsonFragment(['path' => 'items']);
        $this->postJson('/api/categories', ['name' => 'Garden', 'slug' => 'garden', 'items' => []])
            ->assertStatus(422)->assertJsonFragment(['path' => 'items', 'message' => 'Unknown field.']);
    }

    public function test_lines_go_to_the_trash_with_their_order_and_come_back_with_it(): void
    {
        $created = $this->postJson('/api/orders', $this->order([
            ['productId' => $this->kettle->id, 'quantity' => 1, 'price' => 49.5],
            ['productId' => $this->mug->id, 'quantity' => 4, 'price' => 8],
        ]))->json();

        // Deleting it isn't refused for having lines: they go with it.
        $this->deleteJson("/api/orders/{$created['id']}")->assertNoContent();
        $this->assertSame(0, OrderItem::count());
        $this->assertSame(2, OrderItem::onlyTrashed()->count());

        // The trash lists the order, not its lines.
        $listed = array_column($this->getJson('/api/_nevela/trash')->json('resources'), 'slug');
        $this->assertContains('orders', $listed);
        $this->assertNotContains('order-items', $listed);

        $this->postJson("/api/_nevela/trash/orders/{$created['id']}/restore")->assertOk();
        $this->getJson("/api/orders/{$created['id']}")->assertOk()->assertJsonCount(2, 'items');

        // And gone for good with it.
        $this->deleteJson("/api/orders/{$created['id']}")->assertNoContent();
        $this->deleteJson("/api/_nevela/trash/orders/{$created['id']}")->assertNoContent();
        $this->assertSame(0, OrderItem::withTrashed()->count());
    }

    public function test_a_product_on_an_order_cannot_be_deleted(): void
    {
        $this->postJson('/api/orders', $this->order([['productId' => $this->kettle->id, 'quantity' => 1, 'price' => 49.5]]))->assertCreated();

        $this->deleteJson("/api/products/{$this->kettle->id}")->assertStatus(409);
    }

    public function test_the_descriptor_says_which_resource_is_lines(): void
    {
        $this->assertTrue(Nevela::isLines('OrderItem'));
        $this->assertFalse(Nevela::isLines('Order'));
        $this->assertSame(['model' => OrderItem::class, 'column' => 'order_id'], Nevela::linesOf('Order'));
    }
}
