<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Models\Role;
use Nevela\Laravel\Trash\Trash;
use Tests\TestCase;

/** A policy from before the trash existed: it says who may delete, and nothing of restoring. */
class PolicyWithoutTrash
{
    public function delete(User $user, Product $product): bool
    {
        return $user->email === 'keeper@example.com';
    }
}

/**
 * The trash, over HTTP: a deleted record is kept and hidden, can be restored for thirty
 * days, and is then removed for good.
 */
class TrashTest extends TestCase
{
    use RefreshDatabase;

    private Category $kitchen;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        Product::forgetTrash();
        Category::forgetTrash();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $this->kitchen = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param array<string, mixed> $over */
    private function product(string $sku = 'KET-1', array $over = []): Product
    {
        return Product::create($over + ['name' => "Kettle {$sku}", 'sku' => $sku, 'price' => 10, 'category_id' => $this->kitchen->id, 'active' => true, 'kind' => 'stock']);
    }

    public function test_a_deleted_record_is_hidden_everywhere_and_waits_in_the_trash(): void
    {
        Carbon::setTestNow('2026-10-09 12:00:00');
        $kept = $this->product('KET-1');
        $gone = $this->product('KET-2');

        $this->deleteJson("/api/products/{$gone->id}")->assertNoContent();

        // Still on disk, and nowhere a person looks.
        $this->assertTrue(DB::table('products')->where('id', $gone->id)->exists());
        $this->getJson('/api/products')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $kept->id);
        $this->getJson("/api/products/{$gone->id}")->assertNotFound();
        $this->getJson('/api/products/_stats')->assertJsonPath('total', 1);
        $this->getJson('/api/products/_insights')->assertJsonPath('total', 1);
        $this->patchJson("/api/products/{$gone->id}", ['name' => 'Back door'])->assertNotFound();

        $this->getJson('/api/_nevela/trash')->assertOk()
            ->assertJsonPath('days', 30)
            ->assertJsonPath('resources', [
                ['name' => 'Category', 'label' => 'Category', 'pluralLabel' => 'Categories', 'slug' => 'categories', 'icon' => 'tags', 'count' => 0],
                ['name' => 'Product', 'label' => 'Product', 'pluralLabel' => 'Products', 'slug' => 'products', 'icon' => 'package', 'count' => 1],
            ]);
        $this->getJson('/api/_nevela/trash/products')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $gone->id)
            ->assertJsonPath('data.0.label', 'Kettle KET-2')
            ->assertJsonPath('data.0.deletedAt', '2026-10-09T12:00:00.000000Z')
            ->assertJsonPath('data.0.expiresAt', '2026-11-08T12:00:00.000000Z');
        $this->getJson('/api/_nevela/trash/unicorns')->assertNotFound();
    }

    public function test_it_can_be_restored_or_removed_for_good(): void
    {
        $one = $this->product('KET-1');
        $two = $this->product('KET-2');
        $one->delete();
        $two->delete();

        $this->postJson("/api/_nevela/trash/products/{$one->id}/restore")->assertOk()->assertJsonPath('restored', true);
        $this->getJson("/api/products/{$one->id}")->assertOk()->assertJsonPath('sku', 'KET-1');
        // Once it is back it is not in the trash to be restored again.
        $this->postJson("/api/_nevela/trash/products/{$one->id}/restore")->assertNotFound();

        $this->deleteJson("/api/_nevela/trash/products/{$two->id}")->assertNoContent();
        $this->assertFalse(DB::table('products')->where('id', $two->id)->exists());
        $this->deleteJson("/api/_nevela/trash/products/{$two->id}")->assertNotFound();
        // A record that is not deleted can't be removed this way.
        $this->deleteJson("/api/_nevela/trash/products/{$one->id}")->assertNotFound();
        $this->assertTrue(DB::table('products')->where('id', $one->id)->exists());
    }

    public function test_emptying_a_trash_takes_saying_which(): void
    {
        $this->product('KET-1')->delete();
        $this->product('KET-2')->delete();
        $live = $this->product('KET-3');

        $this->deleteJson('/api/_nevela/trash/products')->assertStatus(422)->assertJsonPath('code', 'CONFIRM');
        $this->deleteJson('/api/_nevela/trash/products?confirm=categories')->assertStatus(422);
        $this->assertSame(3, DB::table('products')->count());

        $this->deleteJson('/api/_nevela/trash/products?confirm=products')->assertOk()->assertJsonPath('removed', 2)->assertJsonPath('kept', 0);
        $this->assertSame([$live->id], DB::table('products')->pluck('id')->all());
    }

    public function test_after_thirty_days_it_is_removed_for_good(): void
    {
        Carbon::setTestNow('2026-09-01 09:00:00');
        $old = $this->product('OLD-1');
        $old->delete();
        Carbon::setTestNow('2026-09-20 09:00:00');
        $recent = $this->product('NEW-1');
        $recent->delete();

        // Thirty days and a minute after the first was deleted.
        Carbon::setTestNow('2026-10-01 09:01:00');
        $this->artisan('nevela:trash')->assertSuccessful();
        $this->assertFalse(DB::table('products')->where('id', $old->id)->exists());
        $this->assertTrue(DB::table('products')->where('id', $recent->id)->exists());

        // Where no scheduler runs the command, opening the trash does the same.
        Carbon::setTestNow('2026-10-20 09:01:00');
        $this->getJson('/api/_nevela/trash')->assertOk()->assertJsonPath('resources.1.count', 0);
        $this->assertFalse(DB::table('products')->where('id', $recent->id)->exists());

        // Switched off, deleted records are kept until someone removes them.
        config(['nevela.trash.days' => null]);
        Carbon::setTestNow('2026-10-20 10:00:00');
        $kept = $this->product('KEEP-1');
        $kept->delete();
        Carbon::setTestNow('2030-01-01 00:00:00');
        $this->artisan('nevela:trash')->assertSuccessful();
        $this->getJson('/api/_nevela/trash/products')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.expiresAt', null);
        $this->assertSame([], Trash::purgeExpired());
    }

    public function test_a_unique_value_is_held_by_a_deleted_record_and_says_so(): void
    {
        $this->product('KET-1')->delete();
        $row = ['name' => 'Another kettle', 'sku' => 'KET-1', 'price' => 12, 'categoryId' => $this->kitchen->id, 'active' => true, 'kind' => 'stock'];

        $message = $this->postJson('/api/products', $row)->assertStatus(422)->assertJsonPath('issues.0.path', 'sku')->json('issues.0.message');
        $this->assertStringContainsString('in the trash', $message);
        $bulk = $this->postJson('/api/products/_bulk', ['items' => [$row]])->assertStatus(422)->json('rows.0.issues.0.message');
        $this->assertStringContainsString('in the trash', $bulk);

        // A value held by a record that is still there is said the usual way.
        $this->product('KET-2');
        $taken = $this->postJson('/api/products', ['sku' => 'KET-2'] + $row)->assertStatus(422)->json('issues.0.message');
        $this->assertStringNotContainsString('trash', $taken);

        // Removed for good, the value is free.
        $this->deleteJson('/api/_nevela/trash/products?confirm=products')->assertOk();
        $this->postJson('/api/products', $row)->assertCreated();
    }

    public function test_a_record_and_what_it_belongs_to(): void
    {
        $garden = Category::create(['name' => 'Garden', 'slug' => 'garden']);
        $spade = $this->product('SPD-1', ['category_id' => $garden->id]);

        // A category with products in it still can't be deleted.
        $this->deleteJson("/api/categories/{$garden->id}")->assertStatus(409);
        $spade->delete();
        // With its only product in the trash, it can: and the product can't come back without it.
        $this->deleteJson("/api/categories/{$garden->id}")->assertNoContent();
        $this->postJson("/api/_nevela/trash/products/{$spade->id}/restore")->assertStatus(409)->assertJsonPath('code', 'PARENT_IN_TRASH');
        // Nor can the category be removed for good while a deleted product still belongs to it.
        $this->deleteJson("/api/_nevela/trash/categories/{$garden->id}")->assertStatus(409)->assertJsonPath('code', 'STILL_REFERENCED');
        $this->assertTrue(DB::table('categories')->where('id', $garden->id)->exists());

        // Back in order: the category, then the product.
        $this->postJson("/api/_nevela/trash/categories/{$garden->id}/restore")->assertOk();
        $this->postJson("/api/_nevela/trash/products/{$spade->id}/restore")->assertOk();
        $this->getJson("/api/products/{$spade->id}")->assertOk()->assertJsonPath('categoryId', $garden->id);
    }

    public function test_the_trash_is_for_those_who_may_delete(): void
    {
        $deleted = $this->product('KET-1');
        $deleted->delete();
        Role::query()->create(['name' => 'Viewer', 'description' => null, 'grants' => ['@resources.view'], 'is_system' => false]);
        Role::query()->create(['name' => 'Product remover', 'description' => null, 'grants' => ['products.view', 'products.delete'], 'is_system' => false]);

        $viewer = User::factory()->create();
        Access::grant($viewer, 'Viewer');
        Sanctum::actingAs($viewer);
        $this->getJson('/api/_nevela/trash')->assertOk()->assertJsonPath('resources', []);
        $this->getJson('/api/_nevela/trash/products')->assertForbidden();
        $this->postJson("/api/_nevela/trash/products/{$deleted->id}/restore")->assertForbidden();
        $this->deleteJson("/api/_nevela/trash/products/{$deleted->id}")->assertForbidden();
        $this->deleteJson('/api/_nevela/trash/products?confirm=products')->assertForbidden();

        $remover = User::factory()->create();
        Access::grant($remover, 'Product remover');
        Sanctum::actingAs($remover);
        // Their trash has products in it, and not the categories they have no say over.
        $this->getJson('/api/_nevela/trash')->assertOk()->assertJsonCount(1, 'resources')->assertJsonPath('resources.0.slug', 'products');
        $this->getJson('/api/_nevela/trash/categories')->assertForbidden();
        $this->postJson("/api/_nevela/trash/products/{$deleted->id}/restore")->assertOk();
    }

    public function test_a_policy_written_before_the_trash_answers_with_what_it_says_about_deleting(): void
    {
        $deleted = $this->product('KET-1');
        $deleted->delete();
        Gate::policy(Product::class, PolicyWithoutTrash::class);

        Sanctum::actingAs(User::factory()->create(['email' => 'someone@example.com']));
        $this->getJson('/api/_nevela/trash/products')->assertForbidden();

        Sanctum::actingAs(User::factory()->create(['email' => 'keeper@example.com']));
        $this->getJson('/api/_nevela/trash/products')->assertOk()->assertJsonPath('meta.total', 1);
        $this->postJson("/api/_nevela/trash/products/{$deleted->id}/restore")->assertOk();
    }

    public function test_an_app_that_has_not_migrated_yet_deletes_as_it_always_did(): void
    {
        // As a table is before the migration that gives it a trash.
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn('deleted_at'));
        Product::forgetTrash();

        $product = $this->product('KET-1');
        $this->getJson('/api/products')->assertOk()->assertJsonPath('meta.total', 1);
        $this->deleteJson("/api/products/{$product->id}")->assertNoContent();
        $this->assertFalse(DB::table('products')->where('id', $product->id)->exists());
        // Its trash isn't offered; the one resource that has migrated still has its own.
        $this->getJson('/api/_nevela/trash')->assertOk()->assertJsonCount(1, 'resources')->assertJsonPath('resources.0.slug', 'categories');
        $this->getJson('/api/_nevela/trash/products')->assertNotFound();
        // And a value it held is free at once.
        $this->postJson('/api/products', ['name' => 'Kettle', 'sku' => 'KET-1', 'price' => 10, 'categoryId' => $this->kitchen->id, 'active' => true, 'kind' => 'stock'])->assertCreated();
    }
}
