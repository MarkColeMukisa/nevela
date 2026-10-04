<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Media\ImageOptimizer;
use Nevela\Laravel\Media\Uploads;
use Nevela\Laravel\Models\Upload;
use Tests\TestCase;

/** A role that may look at products and nothing more. */
class ReadOnlyProducts
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function create(User $user): bool
    {
        return false;
    }
}

/**
 * The example shop, over HTTP: a Category has many Products, and both have an image
 * that is optimised when it is uploaded.
 */
class ShopTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
        Uploads::forget();
        Sanctum::actingAs(User::factory()->create());
    }

    private function category(string $name = 'Kitchen'): Category
    {
        return Category::create(['name' => $name, 'slug' => strtolower($name)]);
    }

    /** @param array<string, mixed> $overrides */
    private function product(Category $category, array $overrides = []): array
    {
        return $overrides + ['name' => 'Kettle', 'sku' => 'KET-'.fake()->unique()->numerify('####'), 'price' => 49.5, 'categoryId' => $category->id, 'active' => true, 'kind' => 'stock'];
    }

    private function photo(int $width = 2000, int $height = 1500): string
    {
        $image = imagecreatetruecolor($width, $height);
        for ($i = 0; $i < 300; $i++) {
            imagefilledellipse($image, mt_rand(0, $width), mt_rand(0, $height), mt_rand(20, 300), mt_rand(20, 300), imagecolorallocate($image, mt_rand(0, 255), mt_rand(0, 255), mt_rand(0, 255)));
        }
        ob_start();
        imagejpeg($image, null, 90);

        return (string) ob_get_clean();
    }

    private function upload(string $resource, string $field, string $name, string $type, string $bytes)
    {
        return $this->call('PUT', "/api/_nevela/uploads/{$resource}/{$field}?name=".urlencode($name), [], [], [], [
            'CONTENT_TYPE' => $type,
            'CONTENT_LENGTH' => strlen($bytes),
            'HTTP_ACCEPT' => 'application/json',
        ], $bytes);
    }

    public function test_a_product_belongs_to_a_category_that_has_to_exist(): void
    {
        $category = $this->category();

        $this->postJson('/api/products', $this->product($category))->assertCreated()->assertJsonPath('categoryId', $category->id);
        $this->assertSame('Kitchen', Product::first()->category->name);
        $this->assertSame(1, $category->products()->count());

        $this->postJson('/api/products', $this->product($category, ['categoryId' => '00000000-0000-7000-8000-000000000000']))
            ->assertStatus(422)->assertJsonPath('issues.0.path', 'categoryId');
        $this->postJson('/api/products', array_diff_key($this->product($category), ['categoryId' => true]))
            ->assertStatus(422)->assertJsonPath('issues.0.path', 'categoryId');
    }

    public function test_products_are_listed_by_category(): void
    {
        $kitchen = $this->category('Kitchen');
        $office = $this->category('Office');
        $this->postJson('/api/products', $this->product($kitchen))->assertCreated();
        $this->postJson('/api/products', $this->product($kitchen))->assertCreated();
        $this->postJson('/api/products', $this->product($office))->assertCreated();

        $this->getJson("/api/products?filter[categoryId]={$kitchen->id}")->assertOk()->assertJsonPath('meta.total', 2);
        $this->getJson("/api/products?filter[categoryId]={$office->id}")->assertOk()->assertJsonPath('meta.total', 1);
    }

    public function test_a_category_with_products_is_not_deleted(): void
    {
        $category = $this->category();
        $id = $this->postJson('/api/products', $this->product($category))->json('id');
        $second = $this->postJson('/api/products', $this->product($category))->json('id');

        $this->deleteJson("/api/categories/{$category->id}")->assertStatus(409)->assertJsonPath('error', '2 products belong to this category. Move or delete them first.');
        $this->deleteJson("/api/products/{$second}")->assertNoContent();
        $this->deleteJson("/api/categories/{$category->id}")->assertStatus(409)->assertJsonPath('error', '1 product belongs to this category. Move or delete it first.');
        $this->deleteJson("/api/products/{$id}")->assertNoContent();
        $this->deleteJson("/api/categories/{$category->id}")->assertNoContent();
    }

    public function test_an_uploaded_photo_is_optimised_and_its_renditions_are_made(): void
    {
        if (! ImageOptimizer::available()) {
            $this->markTestSkipped('PHP\'s GD extension is not installed.');
        }
        $bytes = $this->photo();
        $response = $this->upload('Product', 'image', 'My Kettle.JPG', 'image/jpeg', $bytes)->assertCreated();
        $file = $response->json();

        // Product images use the "product" profile: inside 1000×1000, with a square thumb and a card.
        $this->assertTrue($file['optimised']);
        $this->assertSame([1000, 750], [$file['width'], $file['height']]);
        $this->assertSame([300, 300], [$file['renditions']['thumb']['width'], $file['renditions']['thumb']['height']]);
        $this->assertSame([600, 450], [$file['renditions']['card']['width'], $file['renditions']['card']['height']]);
        $this->assertLessThan(strlen($bytes) / 2, $file['size']);
        $this->assertMatchesRegularExpression('#^products/image/\d{4}/\d{2}/[0-9a-f-]{36}-my-kettle\.(webp|jpg)$#', $file['key']);

        // Renditions sit beside the image, named before the extension; the original is kept privately.
        $thumb = preg_replace('/(\.\w+)$/', '.thumb$1', $file['key']);
        Storage::disk('public')->assertExists([$file['key'], $thumb]);
        $upload = Upload::where('key', $file['key'])->firstOrFail();
        Storage::disk('local')->assertExists($upload->original_key);
        $this->assertSame(strlen($bytes), $upload->original_size);

        // Anyone can fetch the file by its key, and a browser may keep it for good.
        $this->get("/api/_nevela/files/{$file['key']}")->assertOk()->assertHeader('Content-Type', $file['mime']);
        $this->assertStringContainsString('immutable', (string) $this->get("/api/_nevela/files/{$thumb}")->assertOk()->headers->get('Cache-Control'));
        $this->get('/api/_nevela/files/'.$upload->original_key)->assertNotFound();

        // The record stores the key and answers with what a page needs to show the image.
        $created = $this->postJson('/api/products', $this->product($this->category(), ['image' => $file['key']]))->assertCreated();
        $created->assertJsonPath('image', $file['key'])->assertJsonPath('imageFile.width', 1000)->assertJsonPath('imageFile.renditions.card.width', 600);
        $this->getJson('/api/products')->assertJsonPath('data.0.imageFile.renditions.thumb.url', url("/api/_nevela/files/{$thumb}"));
    }

    public function test_a_file_that_is_not_what_it_says_is_refused(): void
    {
        $this->upload('Product', 'image', 'fake.png', 'image/png', str_repeat("plain text\n", 40))
            ->assertStatus(422)->assertJsonPath('error', "fake.png doesn't contain image data. It may have been renamed; choose the original file.");
        $this->upload('Product', 'image', 'page.html', 'text/html', '<html><script>alert(1)</script></html>')->assertStatus(422);
        $this->upload('Product', 'name', 'x.jpg', 'image/jpeg', 'x')->assertNotFound();
        $this->upload('Nothing', 'image', 'x.jpg', 'image/jpeg', 'x')->assertNotFound();
        $this->assertSame(0, Upload::count());
    }

    public function test_a_record_only_takes_a_file_uploaded_to_that_field(): void
    {
        if (! ImageOptimizer::available()) {
            $this->markTestSkipped('PHP\'s GD extension is not installed.');
        }
        $category = $this->category();
        $forCategory = $this->upload('Category', 'image', 'kitchen.jpg', 'image/jpeg', $this->photo(400, 300))->assertCreated()->json('key');

        $this->postJson('/api/products', $this->product($category, ['image' => $forCategory]))->assertStatus(422)->assertJsonPath('issues.0.path', 'image');
        $this->postJson('/api/products', $this->product($category, ['image' => 'products/image/made-up.webp']))->assertStatus(422);
        $this->patchJson("/api/categories/{$category->id}", ['image' => $forCategory])->assertOk()->assertJsonPath('imageFile.key', $forCategory);
    }

    public function test_uploading_needs_a_signed_in_user(): void
    {
        $this->app['auth']->forgetGuards();

        $this->upload('Product', 'image', 'x.jpg', 'image/jpeg', 'x')->assertUnauthorized();
    }

    public function test_uploading_takes_permission_to_create_not_just_to_read(): void
    {
        Gate::policy(Product::class, ReadOnlyProducts::class);

        $this->getJson('/api/products')->assertOk();
        $this->upload('Product', 'image', 'kettle.jpg', 'image/jpeg', $this->photo(200, 200))
            ->assertForbidden()->assertJsonPath('error', "You can't upload files to Products.");
        $this->assertSame(0, Upload::count());
    }

    public function test_only_files_uploaded_through_nevela_are_served(): void
    {
        // Something else on the same disk, and a path that was never a key.
        Storage::disk('public')->put('reports/secret.txt', 'not an upload');
        Storage::disk('public')->put('products/image/2026/10/stray.webp', 'not an upload either');

        $this->get('/api/_nevela/files/reports/secret.txt')->assertNotFound();
        $this->get('/api/_nevela/files/products/image/2026/10/stray.webp')->assertNotFound();
        $this->get('/api/_nevela/files/products/image/2026/10/stray.thumb.webp')->assertNotFound();
        $this->get('/api/_nevela/files/..%2F..%2F.env')->assertNotFound();
        $this->get('/api/_nevela/files/products/%25')->assertNotFound();
    }

    public function test_a_rendition_that_was_never_made_gets_the_file_itself(): void
    {
        // A GIF is stored as it is, so it has no thumbnail of its own.
        $image = imagecreatetruecolor(40, 30);
        ob_start();
        imagegif($image);
        $gif = (string) ob_get_clean();
        $file = $this->upload('Product', 'image', 'spinner.gif', 'image/gif', $gif)->assertCreated()->json();

        $this->assertFalse($file['optimised']);
        $this->assertSame([40, 30], [$file['width'], $file['height']]);
        $thumb = preg_replace('/\.gif$/', '.thumb.gif', $file['key']);
        $response = $this->get("/api/_nevela/files/{$thumb}")->assertOk()->assertHeader('Content-Type', 'image/gif');
        $this->assertStringContainsString('max-age=300', (string) $response->headers->get('Cache-Control'));
    }
}
