<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Activity\Activity;
use Nevela\Laravel\Models\Role;
use Tests\TestCase;

/**
 * The activity log: who created, changed, deleted and restored which records, one row per
 * person and kind when done together, and the bell telling everyone else.
 */
class ActivityTest extends TestCase
{
    use RefreshDatabase;

    private Category $kitchen;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        Permissions::forget();
        Product::forgetTrash();
        Category::forgetTrash();
        Activity::forget();
        // Made by nobody signed in, as seeding is: no activity.
        $this->kitchen = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(string $name, string ...$roles): User
    {
        $user = User::factory()->create(['name' => $name]);
        foreach ($roles as $role) {
            $this->assertTrue(Access::grant($user, $role), "no role called {$role}");
        }

        return $user->refresh();
    }

    /** @return array<string, mixed> */
    private function kettle(string $sku): array
    {
        return ['name' => "Kettle {$sku}", 'sku' => $sku, 'price' => 10, 'categoryId' => $this->kitchen->id, 'active' => true, 'kind' => 'stock'];
    }

    /** @return list<object> */
    private function activity(): array
    {
        return DB::table('nevela_activity')->orderBy('created_at')->orderBy('id')->get()->all();
    }

    /** @return list<object> */
    private function bellOf(User $user): array
    {
        return DB::table('nevela_notifications')->where('user_id', (string) $user->getKey())->orderBy('created_at')->get()->all();
    }

    public function test_each_change_is_noted_with_who_made_it_and_others_are_told(): void
    {
        $ada = $this->user('Ada', 'ADMIN');
        $bo = $this->user('Bo', 'EDITOR');
        $nobody = $this->user('Cy', 'USER');
        $this->assertSame([], $this->activity(), 'seeding by nobody signed in leaves no activity');

        Sanctum::actingAs($ada);
        $id = $this->postJson('/api/products', $this->kettle('KET-1'))->assertCreated()->json('id');
        $this->patchJson("/api/products/{$id}", ['name' => 'Kettle, steel'])->assertOk();
        $this->deleteJson("/api/products/{$id}")->assertNoContent();
        $this->postJson("/api/_nevela/trash/products/{$id}/restore")->assertOk();

        $rows = $this->activity();
        $this->assertSame(['created', 'updated', 'deleted', 'restored'], array_column($rows, 'action'), 'restoring saves the record too, and is one restore');
        $this->assertSame(array_fill(0, 4, (string) $ada->getKey()), array_column($rows, 'user_id'));
        $this->assertSame('Kettle KET-1', $rows[0]->label);
        $this->assertSame([$id], json_decode($rows[0]->record_ids, true));

        // Everyone else who may see products is told of the create, delete and restore. A change isn't.
        $this->assertSame(['Ada created a product: Kettle KET-1', 'Ada deleted a product: Kettle, steel', 'Ada restored a product: Kettle, steel'], array_column($this->bellOf($bo), 'title'));
        $this->assertSame(["/dashboard/products/{$id}", '/dashboard/trash', "/dashboard/products/{$id}"], array_column($this->bellOf($bo), 'url'));
        $this->assertSame([], $this->bellOf($ada), 'nobody is told what they did');
        $this->assertSame([], $this->bellOf($nobody), 'nor what they may not see');

        // Deleted again within two minutes: the same row, counted. Then removed for good from
        // the trash: noted, and nobody is told.
        $this->deleteJson("/api/products/{$id}")->assertNoContent();
        $this->deleteJson("/api/_nevela/trash/products/{$id}")->assertNoContent();
        $rows = $this->activity();
        $this->assertSame(['created', 'updated', 'deleted', 'restored', 'purged'], array_column($rows, 'action'));
        $this->assertSame(2, (int) $rows[2]->count);
        $this->assertSame(['Ada created a product: Kettle KET-1', 'Ada deleted 2 products', 'Ada restored a product: Kettle, steel'], array_column($this->bellOf($bo), 'title'));
    }

    public function test_many_at_once_are_one_row_and_one_line_in_the_bell(): void
    {
        $ada = $this->user('Ada', 'ADMIN');
        $bo = $this->user('Bo', 'EDITOR');
        Sanctum::actingAs($ada);

        // "Add several": one request.
        $this->postJson('/api/products/_bulk', ['items' => array_map(fn ($n) => $this->kettle("KET-{$n}"), range(1, 5))])->assertCreated();
        // Deleting a selection: one request each, as the dashboard sends them.
        $ids = Product::query()->orderBy('sku')->pluck('id')->all();
        foreach (array_slice($ids, 0, 3) as $id) {
            $this->deleteJson("/api/products/{$id}")->assertNoContent();
        }

        $rows = $this->activity();
        $this->assertSame(['created', 'deleted'], array_column($rows, 'action'));
        $this->assertSame([5, 3], array_map('intval', array_column($rows, 'count')));
        $this->assertSame(array_slice($ids, 0, 3), json_decode($rows[1]->record_ids, true));

        $bell = $this->bellOf($bo);
        $this->assertSame(['Ada created 5 products', 'Ada deleted 3 products'], array_column($bell, 'title'));
        $this->assertSame([5, 3], array_map('intval', array_column($bell, 'count')));
        $this->assertSame(['/dashboard/products', '/dashboard/trash'], array_column($bell, 'url'));

        // A while later, the next is a row of its own; the bell's line, still unread, keeps counting.
        Carbon::setTestNow(now()->addMinutes(5));
        $this->deleteJson("/api/products/{$ids[3]}")->assertNoContent();
        $this->assertSame([5, 3, 1], array_map('intval', array_column($this->activity(), 'count')));
        $this->assertSame('Ada deleted 4 products', $this->bellOf($bo)[1]->title);

        // Someone else doing the same is their own line.
        Sanctum::actingAs($bo);
        $this->deleteJson("/api/products/{$ids[4]}")->assertNoContent();
        $this->assertSame('Bo deleted a product: Kettle KET-5', collect($this->bellOf($ada))->last()->title);
    }

    public function test_a_failed_create_leaves_nothing(): void
    {
        Sanctum::actingAs($this->user('Ada', 'ADMIN'));
        $this->postJson('/api/products', $this->kettle('KET-1'))->assertCreated();
        // The second row repeats a SKU: the whole batch is refused, and none of it written.
        $this->postJson('/api/products/_bulk', ['items' => [$this->kettle('KET-2'), $this->kettle('KET-1')]])->assertStatus(422);

        $this->assertSame(['created'], array_column($this->activity(), 'action'));
        $this->assertSame(1, (int) $this->activity()[0]->count);
    }

    public function test_the_log_is_for_those_given_it_and_shows_what_they_may_see(): void
    {
        $ada = $this->user('Ada', 'ADMIN');
        Role::query()->create(['name' => 'Kitchen staff', 'description' => null, 'grants' => ['categories.*', 'activity.view'], 'is_system' => false]);
        $kim = $this->user('Kim', 'Kitchen staff');
        $bo = $this->user('Bo', 'EDITOR');

        Sanctum::actingAs($ada);
        $product = $this->postJson('/api/products', $this->kettle('KET-1'))->assertCreated()->json('id');
        $this->postJson('/api/categories', ['name' => 'Garden', 'slug' => 'garden'])->assertCreated();

        $this->getJson('/api/_nevela/activity')->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.action', 'created')
            ->assertJsonPath('data.0.resource', 'Category')
            ->assertJsonPath('data.0.title', 'Garden')
            ->assertJsonPath('data.0.user.name', 'Ada')
            ->assertJsonPath('data.1.url', "/dashboard/products/{$product}");
        $this->getJson('/api/_nevela/activity?resource=Product')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.recordId', $product);
        $this->getJson('/api/_nevela/activity?action=deleted')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/_nevela/activity?action=nonsense')->assertStatus(422);

        // Only categories for someone who may see only categories.
        Sanctum::actingAs($kim);
        $this->getJson('/api/_nevela/activity')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.resource', 'Category');
        // And nothing for someone whose roles don't include the log, though they see the records.
        Sanctum::actingAs($bo);
        $this->getJson('/api/_nevela/activity')->assertForbidden();

        $this->assertContains('activity.view', Permissions::keys());
    }

    public function test_old_rows_are_pruned(): void
    {
        Sanctum::actingAs($this->user('Ada', 'ADMIN'));
        $this->postJson('/api/products', $this->kettle('KET-1'))->assertCreated();
        DB::table('nevela_activity')->update(['updated_at' => now()->subDays(Activity::KEEP_DAYS + 1)]);

        $this->assertSame(1, Activity::prune());
        $this->assertSame([], $this->activity());
    }
}
