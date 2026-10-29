<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/**
 * Fields whose values go together once only. The dev app's products have one name in each
 * category (`"unique": [["categoryId", "name"]]`): two categories may each have a Kettle.
 */
class UniqueTogetherTest extends TestCase
{
    use RefreshDatabase;

    private Category $kitchen;

    private Category $garden;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        Product::forgetTrash();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $this->kitchen = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
        $this->garden = Category::create(['name' => 'Garden', 'slug' => 'garden']);
    }

    /** @return array<string, mixed> */
    private function product(string $name, string $sku, ?Category $category = null): array
    {
        return ['name' => $name, 'sku' => $sku, 'price' => 10, 'categoryId' => ($category ?? $this->kitchen)->id, 'active' => true, 'kind' => 'stock'];
    }

    public function test_the_same_pair_is_refused_and_either_half_on_its_own_is_not(): void
    {
        $this->postJson('/api/products', $this->product('Kettle', 'KET-1'))->assertCreated();

        $this->postJson('/api/products', $this->product('Kettle', 'KET-2'))
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'categoryId')
            ->assertJsonPath('issues.0.message', 'There is already a product with this category and name.');
        $this->postJson('/api/products', $this->product('Kettle', 'KET-3', $this->garden))->assertCreated();
        $this->postJson('/api/products', $this->product('Teapot', 'TEA-1'))->assertCreated();
    }

    public function test_a_change_is_checked_with_the_record_s_own_values_for_what_it_leaves_out(): void
    {
        $kettle = $this->postJson('/api/products', $this->product('Kettle', 'KET-1'))->json('id');
        $teapot = $this->postJson('/api/products', $this->product('Teapot', 'TEA-1'))->json('id');

        // Its own pair is no clash, and a change that sends neither half isn't one either.
        $this->patchJson("/api/products/{$kettle}", ['name' => 'Kettle', 'price' => 12])->assertOk();
        $this->patchJson("/api/products/{$kettle}", ['price' => 14])->assertOk();
        // The teapot renamed into the kettle's place, in the same category, is.
        $this->patchJson("/api/products/{$teapot}", ['name' => 'Kettle'])->assertUnprocessable()->assertJsonPath('issues.0.path', 'categoryId');
        $this->patchJson("/api/products/{$teapot}", ['name' => 'Kettle', 'categoryId' => $this->garden->id])->assertOk();
    }

    public function test_one_in_the_trash_still_holds_its_pair_and_says_so(): void
    {
        $kettle = $this->postJson('/api/products', $this->product('Kettle', 'KET-1'))->json('id');
        $this->deleteJson("/api/products/{$kettle}")->assertNoContent();

        $this->postJson('/api/products', $this->product('Kettle', 'KET-2'))
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.message', 'There is one with these in the trash. Restore it, or delete it for good to use them again.');
    }

    public function test_rows_sent_together_are_kept_apart_from_each_other_and_from_what_is_there(): void
    {
        $this->postJson('/api/products', $this->product('Kettle', 'KET-1'))->assertCreated();

        $this->postJson('/api/products/_bulk', ['items' => [
            $this->product('Teapot', 'TEA-1'),
            $this->product('Teapot', 'TEA-2'),
            $this->product('Kettle', 'KET-2'),
            $this->product('Teapot', 'TEA-3', $this->garden),
        ]])
            ->assertUnprocessable()
            ->assertJsonPath('rows.0.row', 2)
            ->assertJsonPath('rows.0.issues.0.message', 'The same as row 1. Each one needs its own.')
            ->assertJsonPath('rows.1.row', 3)
            ->assertJsonPath('rows.1.issues.0.message', 'There is already a product with this category and name.');
        $this->assertSame(1, Product::count(), 'nothing was created');
    }

    public function test_the_database_refuses_what_gets_past_the_check(): void
    {
        Product::create(['name' => 'Kettle', 'sku' => 'KET-1', 'price' => 10, 'category_id' => $this->kitchen->id, 'active' => true, 'kind' => 'stock']);

        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);
        Product::create(['name' => 'Kettle', 'sku' => 'KET-2', 'price' => 10, 'category_id' => $this->kitchen->id, 'active' => true, 'kind' => 'stock']);
    }

    public function test_seeded_records_each_have_their_own_pair(): void
    {
        Product::create(['name' => 'Kettle', 'sku' => 'KET-1', 'price' => 10, 'category_id' => $this->kitchen->id, 'active' => true, 'kind' => 'stock']);

        $this->artisan('nevela:seed', ['name' => 'Product', '--count' => 60])->assertSuccessful();

        $this->assertSame(61, Product::count());
        $this->assertSame(0, DB::table('products')->select('category_id', 'name')->groupBy('category_id', 'name')->havingRaw('count(*) > 1')->get()->count());
    }
}
