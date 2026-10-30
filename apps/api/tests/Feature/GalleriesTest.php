<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Media\Uploads;
use Tests\TestCase;

/**
 * A field of several files. The dev app's products have a gallery beside their one image
 * (gallery:files(image)?): a list of the keys of pictures uploaded to it.
 */
class GalleriesTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
        Uploads::forget();
        Access::reset();
        Product::forgetTrash();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $this->category = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
    }

    /** @param  list<string>|null  $gallery */
    private function product(string $sku, ?array $gallery = null): array
    {
        return ['name' => "Kettle {$sku}", 'sku' => $sku, 'price' => 49.5, 'categoryId' => $this->category->id, 'active' => true, 'kind' => 'stock'] + ($gallery === null ? [] : ['gallery' => $gallery]);
    }

    private function picture(string $field = 'gallery', string $name = 'kettle.png'): string
    {
        $image = imagecreatetruecolor(400, 300);
        imagefilledellipse($image, mt_rand(50, 350), 150, 120, 120, imagecolorallocate($image, mt_rand(0, 255), 120, 200));
        ob_start();
        imagepng($image);
        $bytes = (string) ob_get_clean();

        return $this->call('PUT', "/api/_nevela/uploads/Product/{$field}?name=".urlencode($name), [], [], [], [
            'CONTENT_TYPE' => 'image/png',
            'CONTENT_LENGTH' => strlen($bytes),
            'HTTP_ACCEPT' => 'application/json',
        ], $bytes)->assertSuccessful()->json('key');
    }

    public function test_a_gallery_keeps_its_pictures_in_order_with_the_details_of_each(): void
    {
        $keys = [$this->picture(), $this->picture(name: 'side.png'), $this->picture(name: 'lid.png')];

        $response = $this->postJson('/api/products', $this->product('KET-1', $keys))
            ->assertCreated()
            ->assertJsonPath('gallery', $keys)
            ->assertJsonCount(3, 'galleryFiles');
        $this->assertSame($keys[1], $response->json('galleryFiles.1.key'));
        $this->assertSame($keys, Product::first()->gallery);

        // One taken out, the rest kept as they were.
        $id = $response->json('id');
        $this->patchJson("/api/products/{$id}", ['gallery' => [$keys[0], $keys[2]]])->assertOk()->assertJsonPath('gallery', [$keys[0], $keys[2]]);
        // A record sent back as it was read, details and all, is taken.
        $echo = $this->getJson("/api/products/{$id}")->json();
        $this->putJson("/api/products/{$id}", array_diff_key($echo, array_flip(['id', 'createdAt', 'updatedAt'])))->assertOk();
        // Emptied: an optional gallery has nothing in it.
        $this->patchJson("/api/products/{$id}", ['gallery' => null])->assertOk()->assertJsonPath('gallery', null)->assertJsonPath('galleryFiles', []);
    }

    public function test_only_pictures_uploaded_to_the_gallery_go_in_it_once_each_and_twenty_at_most(): void
    {
        $picture = $this->picture();
        $image = $this->picture('image');

        // The product's own image wasn't uploaded to its gallery.
        $this->postJson('/api/products', $this->product('KET-1', [$picture, $image]))
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'gallery.1');
        $this->postJson('/api/products', $this->product('KET-1', [$picture, $picture]))->assertUnprocessable()->assertJsonPath('issues.0.path', 'gallery.0');
        $this->postJson('/api/products', $this->product('KET-1', array_fill(0, 21, $picture)))->assertUnprocessable()->assertJsonPath('issues.0.path', 'gallery');
        $this->postJson('/api/products', array_merge($this->product('KET-1'), ['gallery' => 'not a list']))->assertUnprocessable()->assertJsonPath('issues.0.path', 'gallery');
        // Keys by name aren't a list either: the order is the list's.
        $this->postJson('/api/products', array_merge($this->product('KET-1'), ['gallery' => ['front' => $picture]]))->assertUnprocessable()->assertJsonPath('issues.0.path', 'gallery');
        $this->assertSame(0, Product::count());
    }

    public function test_the_list_shows_each_record_s_gallery(): void
    {
        $keys = [$this->picture(), $this->picture(name: 'side.png')];
        $this->postJson('/api/products', $this->product('KET-1', $keys))->assertCreated();
        $this->postJson('/api/products', $this->product('KET-2'))->assertCreated();

        $list = collect($this->getJson('/api/products?sort=sku')->assertOk()->json('data'));
        $this->assertSame($keys, $list[0]['gallery']);
        $this->assertCount(2, $list[0]['galleryFiles']);
        $this->assertSame([], $list[1]['galleryFiles']);
    }
}
