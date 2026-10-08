<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Models\Role;
use Tests\TestCase;

/**
 * Several records in one request (POST /{slug}/_bulk), as the dashboard's grid sends them:
 * all of them, or none and the rows that were wrong.
 */
class BulkCreateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
    }

    public function test_several_rows_are_created_together(): void
    {
        $response = $this->postJson('/api/categories/_bulk', ['items' => [
            ['name' => 'Kitchen', 'slug' => 'kitchen'],
            ['name' => 'Garden', 'slug' => 'garden'],
            ['name' => 'Office', 'slug' => 'office'],
        ]]);

        $response->assertCreated()->assertJsonPath('created', 3)->assertJsonCount(3, 'data')->assertJsonPath('data.1.name', 'Garden');
        $this->assertNotEmpty($response->json('data.0.id'));
        $this->assertSame(['garden', 'kitchen', 'office'], Category::query()->orderBy('slug')->pluck('slug')->all());
    }

    public function test_one_wrong_row_means_none_are_created_and_says_which(): void
    {
        $this->postJson('/api/categories/_bulk', ['items' => [
            ['name' => 'Kitchen', 'slug' => 'kitchen'],
            ['name' => '', 'slug' => 'not a slug!'],
            ['name' => 'Office', 'slug' => 'office'],
        ]])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Nothing was created: row 2 needs fixing.')
            ->assertJsonCount(1, 'rows')
            ->assertJsonPath('rows.0.row', 2)
            ->assertJsonPath('rows.0.issues.0.path', 'name');

        $this->assertSame(0, Category::query()->count());
    }

    public function test_rows_obey_the_same_rules_as_the_form(): void
    {
        $category = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
        Product::create(['name' => 'Kettle', 'sku' => 'KET-1', 'price' => 10, 'category_id' => $category->id, 'active' => true, 'kind' => 'stock']);
        $row = fn (array $over) => $over + ['name' => 'Pan', 'sku' => 'PAN-1', 'price' => 12.5, 'categoryId' => $category->id, 'active' => true, 'kind' => 'stock'];

        $response = $this->postJson('/api/products/_bulk', ['items' => [
            $row(['sku' => 'KET-1']),                                    // already in the table
            $row(['sku' => 'PAN-2', 'kind' => 'rented']),                // not one of the options
            $row(['sku' => 'PAN-3', 'categoryId' => '00000000-0000-4000-8000-000000000000']), // no such category
            $row(['sku' => 'PAN-4', 'colour' => 'red']),                 // not a field
            $row(['sku' => 'PAN-5']),                                    // fine
            $row(['sku' => 'PAN-5']),                                    // the same as the row above
        ]])->assertStatus(422)->assertJsonPath('error', 'Nothing was created: 5 of the 6 rows need fixing.');

        $byRow = collect($response->json('rows'))->keyBy('row');
        $this->assertSame([1, 2, 3, 4, 6], $byRow->keys()->all());
        $this->assertSame('sku', $byRow[1]['issues'][0]['path']);
        $this->assertSame('kind', $byRow[2]['issues'][0]['path']);
        $this->assertSame('categoryId', $byRow[3]['issues'][0]['path']);
        $this->assertSame(['path' => 'colour', 'message' => 'Unknown field.'], $byRow[4]['issues'][0]);
        $this->assertSame(['path' => 'sku', 'message' => 'The same as row 5. Each one needs its own.'], $byRow[6]['issues'][0]);
        $this->assertSame(1, Product::query()->count());

        // Put right, they all go in, with the optional fields left out.
        $this->postJson('/api/products/_bulk', ['items' => [$row(['sku' => 'PAN-1']), $row(['sku' => 'PAN-2'])]])->assertCreated()->assertJsonPath('created', 2);
        $this->assertSame(3, Product::query()->count());
        $this->assertNull(Product::query()->where('sku', 'PAN-1')->firstOrFail()->notes);
    }

    public function test_what_is_sent_has_to_be_a_list_of_rows_and_not_too_many(): void
    {
        $this->postJson('/api/categories/_bulk', [])->assertStatus(422);
        $this->postJson('/api/categories/_bulk', ['items' => []])->assertStatus(422);
        $this->postJson('/api/categories/_bulk', ['items' => ['name' => 'Kitchen']])->assertStatus(422);
        $this->postJson('/api/categories/_bulk', ['items' => ['Kitchen', [], ['name' => 'Office', 'slug' => 'office']]])
            ->assertStatus(422)->assertJsonPath('rows.0.row', 1)->assertJsonPath('rows.1.issues.0.message', 'This row is empty.');

        config(['nevela.bulk_max' => 2]);
        $rows = array_map(fn (int $n) => ['name' => "Category {$n}", 'slug' => "category-{$n}"], [1, 2, 3]);
        $this->postJson('/api/categories/_bulk', ['items' => $rows])->assertStatus(422)->assertJsonMissingPath('rows');
        $this->assertSame(0, Category::query()->count());
    }

    public function test_it_takes_the_permission_to_create(): void
    {
        Role::query()->create(['name' => 'Viewer', 'description' => null, 'grants' => ['categories.view'], 'is_system' => false]);
        Role::query()->create(['name' => 'Maker', 'description' => null, 'grants' => ['categories.create'], 'is_system' => false]);
        $rows = ['items' => [['name' => 'Kitchen', 'slug' => 'kitchen']]];

        $viewer = User::factory()->create();
        Access::grant($viewer, 'Viewer');
        Sanctum::actingAs($viewer);
        $this->postJson('/api/categories/_bulk', $rows)->assertForbidden();

        $maker = User::factory()->create();
        Access::grant($maker, 'Maker');
        Sanctum::actingAs($maker);
        $this->postJson('/api/categories/_bulk', $rows)->assertCreated();
    }
}
