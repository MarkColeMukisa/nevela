<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/**
 * What the dashboard's insights panel is drawn from (GET /{slug}/_insights): how many
 * were created in each period, and how they split across each field that is a choice.
 */
class InsightsTest extends TestCase
{
    use RefreshDatabase;

    private Category $kitchen;

    private Category $garden;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-09 12:00:00');
        Access::reset();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $this->kitchen = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
        $this->garden = Category::create(['name' => 'Garden', 'slug' => 'garden']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param array<string, mixed> $over */
    private function product(string $created, array $over = []): Product
    {
        static $n = 0;
        $product = Product::create($over + ['name' => 'Kettle', 'sku' => 'SKU-'.(++$n), 'price' => 10, 'category_id' => $this->kitchen->id, 'active' => true, 'kind' => 'stock']);
        // Dated by hand: create() stamps it with now.
        $product->forceFill(['created_at' => $created])->saveQuietly();

        return $product;
    }

    public function test_it_counts_what_was_created_in_each_period_and_each_choice(): void
    {
        $this->product('2026-10-09 08:00:00');
        $this->product('2026-10-09 23:00:00', ['kind' => 'digital']);
        $this->product('2026-10-05 10:00:00', ['active' => false]);
        $this->product('2026-09-30 10:00:00');
        $this->product('2026-02-14 10:00:00', ['kind' => 'digital']);
        $this->product('2024-01-01 10:00:00');

        $byDay = $this->getJson('/api/products/_insights')->assertOk()->assertJsonPath('unit', 'day')->assertJsonPath('total', 6)->assertJsonCount(30, 'series');
        $days = collect($byDay->json('series'))->pluck('count', 'bucket');
        $this->assertSame(2, $days['2026-10-09']);
        $this->assertSame(1, $days['2026-10-05']);
        $this->assertSame(1, $days['2026-09-30']);
        $this->assertSame(0, $days['2026-10-08']);
        // The chart is the last thirty days; the total is everything.
        $this->assertSame(4, $days->sum());

        $weeks = collect($this->getJson('/api/products/_insights?unit=week')->assertOk()->assertJsonCount(26, 'series')->json('series'))->pluck('count', 'bucket');
        $this->assertSame(3, $weeks['2026-10-05'], 'Monday the 5th to Friday the 9th');
        $this->assertSame(1, $weeks['2026-09-28']);

        $months = collect($this->getJson('/api/products/_insights?unit=month')->assertOk()->assertJsonCount(12, 'series')->json('series'))->pluck('count', 'bucket');
        $this->assertSame(3, $months['2026-10']);
        $this->assertSame(1, $months['2026-09']);
        $this->assertSame(1, $months['2026-02']);
        $this->assertSame(5, $months->sum());

        // Every choice a field has, in its own order, whether or not anything holds it.
        $breakdown = collect($byDay->json('breakdown'))->keyBy('field');
        $this->assertSame(['active', 'kind'], $breakdown->keys()->all());
        $this->assertSame([['value' => 'true', 'count' => 5], ['value' => 'false', 'count' => 1]], $breakdown['active']['slices']);
        $this->assertSame([['value' => 'stock', 'count' => 4], ['value' => 'digital', 'count' => 2]], $breakdown['kind']['slices']);
    }

    public function test_it_describes_the_rows_the_table_is_showing(): void
    {
        $this->product('2026-10-09 08:00:00', ['name' => 'Copper kettle']);
        $this->product('2026-10-08 08:00:00', ['name' => 'Spade', 'kind' => 'digital', 'category_id' => $this->garden->id]);
        $this->product('2026-10-07 08:00:00', ['name' => 'Rake', 'category_id' => $this->garden->id]);

        $filtered = $this->getJson('/api/products/_insights?filter[kind]=stock')->assertOk()->assertJsonPath('total', 2);
        $this->assertSame(2, collect($filtered->json('series'))->sum('count'));
        $this->assertSame([['value' => 'stock', 'count' => 2], ['value' => 'digital', 'count' => 0]], collect($filtered->json('breakdown'))->firstWhere('field', 'kind')['slices']);

        $this->getJson('/api/products/_insights?q=kettle')->assertOk()->assertJsonPath('total', 1);
        $this->getJson("/api/products/_insights?filter[categoryId]={$this->garden->id}&unit=week")->assertOk()->assertJsonPath('total', 2);
        // Where in the list someone is, and how it is sorted, change no count.
        $this->getJson('/api/products/_insights?page=4&perPage=10&sort=-price')->assertOk()->assertJsonPath('total', 3);
    }

    public function test_a_resource_with_no_choices_still_has_its_chart(): void
    {
        $this->getJson('/api/categories/_insights?unit=month')->assertOk()
            ->assertJsonPath('total', 2)->assertJsonPath('breakdown', [])->assertJsonPath('series.11.count', 2);
    }

    public function test_what_it_refuses(): void
    {
        $this->getJson('/api/products/_insights?unit=year')->assertStatus(400)->assertJsonPath('issues.0.param', 'unit');
        $this->getJson('/api/products/_insights?filter[colour]=red')->assertStatus(400);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/products/_insights')->assertForbidden();
    }
}
