<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/**
 * A required yes/no left out is a no. The dev app's products are `active` or not, and
 * nothing says what `active` starts as.
 */
class BooleansLeftOutTest extends TestCase
{
    use RefreshDatabase;

    private Category $kitchen;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        Product::forgetTrash();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $this->kitchen = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
    }

    /** @return array<string, mixed> */
    private function product(string $sku = 'KET-1'): array
    {
        return ['name' => 'Kettle '.$sku, 'sku' => $sku, 'price' => 10, 'categoryId' => $this->kitchen->id, 'kind' => 'stock'];
    }

    public function test_left_out_it_is_false(): void
    {
        $this->postJson('/api/products', $this->product())->assertCreated()->assertJsonPath('active', false);
    }

    public function test_sent_it_is_what_was_sent(): void
    {
        $this->postJson('/api/products', $this->product() + ['active' => true])->assertCreated()->assertJsonPath('active', true);
    }

    public function test_empty_or_not_a_yes_or_no_is_still_refused(): void
    {
        $this->postJson('/api/products', $this->product() + ['active' => null])->assertUnprocessable()->assertJsonPath('issues.0.path', 'active');
        $this->postJson('/api/products', $this->product() + ['active' => 'perhaps'])->assertUnprocessable()->assertJsonPath('issues.0.path', 'active');
    }

    public function test_a_replace_that_leaves_it_out_makes_it_false_and_a_patch_keeps_it(): void
    {
        $id = $this->postJson('/api/products', $this->product() + ['active' => true])->json('id');

        $this->patchJson("/api/products/{$id}", ['name' => 'Renamed'])->assertOk()->assertJsonPath('active', true);
        // A replace is the whole record: what it leaves out goes back to its default.
        $this->putJson("/api/products/{$id}", $this->product())->assertOk()->assertJsonPath('active', false);
    }

    public function test_several_made_at_once_are_false_too(): void
    {
        $this->postJson('/api/products/_bulk', ['items' => [$this->product('KET-1'), $this->product('KET-2')]])->assertCreated();

        $this->assertSame([false, false], Product::query()->orderBy('sku')->pluck('active')->map(fn ($active) => (bool) $active)->all());
    }
}
