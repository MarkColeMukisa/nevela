<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Support\SchemaFacts;
use RuntimeException;
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

    public function test_a_save_that_empties_the_number_leaves_it_as_it_was(): void
    {
        $order = $this->postJson('/api/orders', ['customer' => 'Ada', 'status' => 'pending'])->json();

        $this->patchJson("/api/orders/{$order['id']}", ['number' => ''])->assertOk()->assertJsonPath('number', 'ORD-0001');
        $this->putJson("/api/orders/{$order['id']}", ['customer' => 'Ada', 'status' => 'paid'])->assertOk()->assertJsonPath('number', 'ORD-0001');
    }

    public function test_a_number_in_the_trash_is_not_given_again(): void
    {
        $order = Order::create(['customer' => 'Ada', 'status' => 'pending']);
        $order->delete();

        $this->assertSame('ORD-0002', Order::create(['customer' => 'Grace', 'status' => 'pending'])->number);
    }

    public function test_a_number_removed_for_good_is_not_given_again(): void
    {
        Order::create(['customer' => 'Ada', 'status' => 'pending'])->forceDelete();

        $this->assertSame('ORD-0002', Order::create(['customer' => 'Grace', 'status' => 'pending'])->number);
    }

    public function test_a_number_is_given_back_when_what_it_was_for_is_undone(): void
    {
        try {
            DB::transaction(function () {
                Order::create(['customer' => 'Ada', 'status' => 'pending']);
                throw new RuntimeException('Something after it failed.');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame('ORD-0001', Order::create(['customer' => 'Grace', 'status' => 'pending'])->number);
    }

    public function test_seeded_numbers_count_and_a_fresh_seed_starts_again(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 5])->assertSuccessful();
        $this->assertSame('ORD-0006', Order::create(['customer' => 'Grace', 'status' => 'pending'])->number);

        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 2, '--fresh' => true])->assertSuccessful();

        $this->assertSame('ORD-0003', Order::create(['customer' => 'Linus', 'status' => 'pending'])->number);
    }

    public function test_seeding_again_goes_on_from_the_last_number_given(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 3])->assertSuccessful();
        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 2])->assertSuccessful();

        $this->assertSame(['ORD-0001', 'ORD-0002', 'ORD-0003', 'ORD-0004', 'ORD-0005'], Order::query()->orderBy('number')->pluck('number')->all());
        $this->assertSame('ORD-0006', Order::create(['customer' => 'Ada', 'status' => 'pending'])->number);

        // A number removed for good isn't given again by the seeder either.
        Order::query()->where('number', 'ORD-0006')->first()->forceDelete();
        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 1])->assertSuccessful();
        $this->assertSame('ORD-0007', Order::query()->orderByDesc('number')->value('number'));
    }

    public function test_a_seeded_number_removed_for_good_is_not_given_again(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 3])->assertSuccessful();
        Order::query()->where('number', 'ORD-0003')->first()->forceDelete();

        $this->assertSame('ORD-0004', Order::create(['customer' => 'Ada', 'status' => 'pending'])->number);

        Order::query()->where('number', 'ORD-0004')->first()->forceDelete();
        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 1])->assertSuccessful();
        $this->assertSame('ORD-0005', Order::query()->orderByDesc('number')->value('number'));
    }

    public function test_something_typed_in_that_is_longer_and_not_a_number_does_not_hide_the_highest(): void
    {
        Order::create(['customer' => 'Ada', 'status' => 'pending', 'number' => 'ORD-5000']);
        foreach (range(1, 120) as $n) {
            Order::create(['customer' => 'Ada', 'status' => 'pending', 'number' => 'ORD-2026-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT)]);
        }

        $this->assertSame('ORD-5001', Order::create(['customer' => 'Grace', 'status' => 'pending'])->number);
    }

    public function test_seeding_goes_on_from_a_number_typed_in(): void
    {
        Order::create(['customer' => 'Ada', 'status' => 'pending', 'number' => 'ORD-5000']);

        $this->artisan('nevela:seed', ['name' => 'Order', '--count' => 1])->assertSuccessful();

        $this->assertSame('ORD-5001', Order::query()->orderByDesc('number')->value('number'));
    }

    public function test_an_app_upgraded_and_not_yet_migrated_still_numbers_its_records(): void
    {
        Schema::drop('nevela_numbers');
        SchemaFacts::forget();

        $this->assertSame('ORD-0001', Order::create(['customer' => 'Ada', 'status' => 'pending'])->number);
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
