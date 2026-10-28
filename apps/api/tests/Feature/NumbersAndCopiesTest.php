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
use Tests\TestCase;

/**
 * An order's number, made by Laravel (`"auto": "ORD"`), and an item's price, copied
 * from its product (`"from": "productId.price"`), over HTTP and from code.
 */
class NumbersAndCopiesTest extends TestCase
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

    public function test_an_order_made_without_a_number_is_given_the_next(): void
    {
        $first = $this->postJson('/api/orders', ['customer' => 'Ada', 'status' => 'pending'])->assertCreated()->json('number');
        $second = $this->postJson('/api/orders', ['customer' => 'Grace', 'status' => 'pending', 'number' => ''])->assertCreated()->json('number');

        $this->assertSame(['ORD-0001', 'ORD-0002'], [$first, $second]);
        // One typed in is kept, and the next follows the highest.
        $this->postJson('/api/orders', ['customer' => 'Alan', 'status' => 'pending', 'number' => 'ORD-0041'])->assertCreated();
        $this->assertSame('ORD-0042', Order::create(['customer' => 'Linus', 'status' => 'pending'])->number);
    }

    public function test_a_number_in_the_trash_is_not_given_again(): void
    {
        $order = Order::create(['customer' => 'Ada', 'status' => 'pending']);
        $order->delete();

        $this->assertSame('ORD-0002', Order::create(['customer' => 'Grace', 'status' => 'pending'])->number);
    }

    public function test_an_items_price_is_its_products_whatever_is_sent(): void
    {
        $order = $this->postJson('/api/orders', ['customer' => 'Ada', 'status' => 'pending', 'items' => [
            ['productId' => $this->kettle->id, 'quantity' => 2, 'price' => 1],
            ['productId' => $this->mug->id, 'quantity' => 1],
        ]])->assertCreated()->json();

        $this->assertSame([49.5, 8], array_map(fn (array $item) => $item['price'] + 0, $order['items']));
        $this->assertEquals(107, $order['total']);
    }

    public function test_a_price_is_kept_when_the_product_changes_its_price_and_copied_again_when_the_item_changes_product(): void
    {
        $order = $this->postJson('/api/orders', ['customer' => 'Ada', 'status' => 'pending', 'items' => [
            ['productId' => $this->kettle->id, 'quantity' => 1],
        ]])->json();
        $this->kettle->update(['price' => 60]);

        // Saved again as it was: last week's order keeps last week's price.
        $kept = $this->patchJson("/api/orders/{$order['id']}", ['items' => $order['items']])->assertOk()->json('items.0.price');
        $this->assertEquals(49.5, $kept);

        // Pointed at another product: that one's price.
        $item = ['productId' => $this->mug->id] + $order['items'][0];
        $this->assertEquals(8, $this->patchJson("/api/orders/{$order['id']}", ['items' => [$item]])->assertOk()->json('items.0.price'));
    }

    public function test_an_item_made_in_code_or_through_its_own_api_is_copied_too(): void
    {
        $order = Order::create(['customer' => 'Ada', 'status' => 'pending']);

        $this->assertEquals(8, OrderItem::create(['order_id' => $order->id, 'product_id' => $this->mug->id, 'quantity' => 1])->price);
        $this->postJson('/api/order-items', ['orderId' => $order->id, 'productId' => $this->kettle->id, 'quantity' => 1, 'price' => 2])
            ->assertCreated()
            ->assertJsonPath('price', 49.5);
    }
}
