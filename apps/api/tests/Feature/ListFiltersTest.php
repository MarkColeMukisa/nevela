<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/**
 * A list asked for more than one equal value: one of several (in), larger or smaller
 * (gt, lt, between), words within (contains), when it was made, and its lines (include).
 */
class ListFiltersTest extends TestCase
{
    use RefreshDatabase;

    private Category $kitchen;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $this->kitchen = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
    }

    private function product(string $name, float $price, string $kind = 'stock'): Product
    {
        return Product::create(['name' => $name, 'sku' => strtoupper(substr($name, 0, 3)).'-'.fake()->unique()->numerify('###'), 'price' => $price, 'category_id' => $this->kitchen->id, 'active' => true, 'kind' => $kind]);
    }

    /** @return list<string> */
    private function names(string $query): array
    {
        $names = $this->getJson("/api/products?sort=name&{$query}")->assertOk()->json('data.*.name');
        sort($names);

        return $names;
    }

    public function test_prices_by_range_and_names_by_words_within(): void
    {
        $this->product('Kettle', 49.5);
        $this->product('Mug', 8);
        $this->product('Teapot', 20);
        $this->product('Tea towel', 5, 'digital');

        $this->assertSame(['Kettle', 'Teapot'], $this->names('filter[price][gt]=10'));
        $this->assertSame(['Mug', 'Tea towel'], $this->names('filter[price][lt]=10'));
        $this->assertSame(['Mug', 'Teapot'], $this->names('filter[price][between]=8,20'));
        $this->assertSame(['Teapot'], $this->names('filter[price][gt]=10&filter[price][lt]=30'));
        $this->assertSame(['Tea towel', 'Teapot'], $this->names('filter[name][contains]=TEA'));
        // A % is a character to find, not "anything".
        $this->assertSame([], $this->names('filter[name][contains]=%25'));
        $this->assertSame(['Kettle', 'Mug', 'Tea towel'], $this->names('filter[name][in]=Kettle,Mug,Tea towel'));
        $this->assertSame(['Kettle', 'Mug', 'Tea towel', 'Teapot'], $this->names('filter[kind]=stock,digital'));
        $this->assertSame(['Tea towel'], $this->names('filter[kind][]=digital'));
    }

    public function test_one_of_several_records_it_belongs_to(): void
    {
        $garden = Category::create(['name' => 'Garden', 'slug' => 'garden']);
        $hall = Category::create(['name' => 'Hall', 'slug' => 'hall']);
        $this->product('Kettle', 49.5);
        Product::create(['name' => 'Spade', 'sku' => 'SPA-1', 'price' => 30, 'category_id' => $garden->id, 'active' => true, 'kind' => 'stock']);
        Product::create(['name' => 'Mat', 'sku' => 'MAT-1', 'price' => 12, 'category_id' => $hall->id, 'active' => true, 'kind' => 'stock']);

        $this->assertSame(['Kettle', 'Spade'], $this->names("filter[categoryId]={$this->kitchen->id},{$garden->id}"));
        // An id that can't be one is no record, not a database error.
        $this->assertSame(['Spade'], $this->names("filter[categoryId]=nope,{$garden->id}"));
        $this->assertSame([], $this->names('filter[categoryId]=nope,also-nope'));
    }

    public function test_when_it_was_made_and_a_date_is_the_whole_day(): void
    {
        foreach (['Kettle' => '2026-11-01 08:00:00', 'Mug' => '2026-11-01 23:30:00', 'Teapot' => '2026-11-02 00:00:00', 'Spade' => '2026-11-05 12:00:00'] as $name => $at) {
            $product = $this->product($name, 10);
            DB::table('products')->where('id', $product->id)->update(['created_at' => Carbon::parse($at)]);
        }

        $this->assertSame(['Kettle', 'Mug'], $this->names('filter[createdAt][between]=2026-11-01,2026-11-01'));
        $this->assertSame(['Spade', 'Teapot'], $this->names('filter[createdAt][gt]=2026-11-01'));
        $this->assertSame(['Kettle', 'Mug'], $this->names('filter[createdAt][lt]=2026-11-02'));
        $this->assertSame(['Mug', 'Spade', 'Teapot'], $this->names('filter[createdAt][gt]=2026-11-01T12:00:00'));
    }

    public function test_what_a_field_cannot_be_asked_is_a_400_that_says_why(): void
    {
        $this->getJson('/api/products?filter[active][gt]=1&filter[price][contains]=4&filter[kind][between]=a,b&filter[createdAt]=2026-11-01&include=items')
            ->assertStatus(400)
            ->assertJsonPath('issues.*.param', ['filter[active][gt]', 'filter[price][contains]', 'filter[kind][between]', 'filter[createdAt]', 'include']);
    }

    public function test_insights_count_the_same_records(): void
    {
        $this->product('Kettle', 49.5);
        $this->product('Mug', 8);

        $this->getJson('/api/products/_insights?filter[price][gt]=10')->assertOk()->assertJsonPath('total', 1);
    }

    public function test_a_list_of_orders_with_their_lines_in_two_queries(): void
    {
        $kettle = $this->product('Kettle', 49.5);
        $mug = $this->product('Mug', 8);
        foreach (range(1, 3) as $i) {
            $this->postJson('/api/orders', ['number' => "ORD-{$i}", 'customer' => 'Ada', 'status' => 'pending', 'items' => [
                ['productId' => $kettle->id, 'quantity' => 1, 'price' => 49.5],
                ['productId' => $mug->id, 'quantity' => $i, 'price' => 8],
            ]])->assertCreated();
        }

        $this->assertArrayNotHasKey('items', $this->getJson('/api/orders')->json('data.0'));

        DB::enableQueryLog();
        $response = $this->getJson('/api/orders?include=items')->assertOk();
        $lines = array_filter(DB::getQueryLog(), fn (array $q) => str_contains($q['query'], 'order_items'));
        DB::disableQueryLog();

        $this->assertCount(3, $response->json('data'));
        foreach ($response->json('data') as $order) {
            $this->assertCount(2, $order['items']);
            $this->assertSame($order['id'], $order['items'][0]['orderId']);
        }
        $this->assertCount(1, $lines, 'The lines of every order on the page come in one query.');
        $this->assertSame(3, Order::count());
    }
}
