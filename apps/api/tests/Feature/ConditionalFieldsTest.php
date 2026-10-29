<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/**
 * A field that applies for some values of another only. The dev app's products have a
 * download address for a digital one (`"when": {"kind": "digital"}`): needed there, and
 * empty for one in stock, however the record arrives.
 */
class ConditionalFieldsTest extends TestCase
{
    use RefreshDatabase;

    private const NEEDED = 'Needed when the kind is Digital.';

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        Product::forgetTrash();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
        $this->category = Category::create(['name' => 'Books', 'slug' => 'books']);
    }

    /** @return array<string, mixed> */
    private function product(string $sku, string $kind, ?string $downloadUrl = null): array
    {
        return ['name' => "Guide {$sku}", 'sku' => $sku, 'price' => 10, 'categoryId' => $this->category->id, 'active' => true, 'kind' => $kind] + ($downloadUrl === null ? [] : ['downloadUrl' => $downloadUrl]);
    }

    public function test_it_is_needed_where_it_applies_and_emptied_where_it_doesn_t(): void
    {
        $this->postJson('/api/products', $this->product('E-1', 'digital'))
            ->assertUnprocessable()
            ->assertJsonPath('issues.0.path', 'downloadUrl')
            ->assertJsonPath('issues.0.message', self::NEEDED);

        $this->postJson('/api/products', $this->product('E-1', 'digital', 'https://example.com/guide.pdf'))
            ->assertCreated()
            ->assertJsonPath('downloadUrl', 'https://example.com/guide.pdf');
        // Sent for a product in stock, it isn't kept.
        $this->postJson('/api/products', $this->product('P-1', 'stock', 'https://example.com/stray.pdf'))
            ->assertCreated()
            ->assertJsonPath('downloadUrl', null);
    }

    public function test_a_change_is_judged_with_the_record_s_own_values_for_what_it_leaves_out(): void
    {
        $ebook = $this->postJson('/api/products', $this->product('E-1', 'digital', 'https://example.com/guide.pdf'))->json('id');
        $book = $this->postJson('/api/products', $this->product('P-1', 'stock'))->json('id');

        // Neither sent: what it had stands.
        $this->patchJson("/api/products/{$ebook}", ['price' => 12])->assertOk()->assertJsonPath('downloadUrl', 'https://example.com/guide.pdf');
        // Emptied while it applies: refused.
        $this->patchJson("/api/products/{$ebook}", ['downloadUrl' => null])->assertUnprocessable()->assertJsonPath('issues.0.message', self::NEEDED);
        // Made a stock product, it loses the address without being sent one.
        $this->patchJson("/api/products/{$ebook}", ['kind' => 'stock'])->assertOk()->assertJsonPath('downloadUrl', null);
        $this->assertNull(Product::find($ebook)->download_url);

        // Made digital, it needs one, sent with it.
        $this->patchJson("/api/products/{$book}", ['kind' => 'digital'])->assertUnprocessable()->assertJsonPath('issues.0.path', 'downloadUrl');
        $this->patchJson("/api/products/{$book}", ['kind' => 'digital', 'downloadUrl' => 'https://example.com/book.pdf'])->assertOk()->assertJsonPath('downloadUrl', 'https://example.com/book.pdf');
    }

    public function test_rows_sent_together_are_held_to_it_the_same_way(): void
    {
        $this->postJson('/api/products/_bulk', ['items' => [
            $this->product('E-1', 'digital', 'https://example.com/guide.pdf'),
            $this->product('E-2', 'digital'),
        ]])
            ->assertStatus(422)
            ->assertJsonPath('rows.0.row', 2)
            ->assertJsonPath('rows.0.issues.0.path', 'downloadUrl')
            ->assertJsonPath('rows.0.issues.0.message', self::NEEDED);

        $this->postJson('/api/products/_bulk', ['items' => [
            $this->product('E-1', 'digital', 'https://example.com/guide.pdf'),
            $this->product('P-1', 'stock', 'https://example.com/stray.pdf'),
        ]])->assertCreated();
        $this->assertSame(['E-1' => 'https://example.com/guide.pdf', 'P-1' => null], Product::orderBy('sku')->pluck('download_url', 'sku')->all());
    }
}
