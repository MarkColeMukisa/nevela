<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Activity\Activity;
use Nevela\Laravel\Models\Role;
use Nevela\Laravel\Support\SchemaFacts;
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

    /**
     * The log as its page shows it, oldest first: entries joined into lines by their group.
     *
     * @return list<array<string, mixed>>
     */
    private function lines(User $viewer): array
    {
        return array_reverse(Activity::for($viewer, [], 1, 100)['data']);
    }

    /** @return list<object> */
    private function bellOf(User $user): array
    {
        // created_at is to the second; the id (a uuid7) is to the millisecond, for those written together.
        return DB::table('nevela_notifications')->where('user_id', (string) $user->getKey())->orderBy('created_at')->orderBy('id')->get()->all();
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
        // Each sealed in turn.
        $this->assertSame([1, 2, 3, 4], array_map('intval', array_column($rows, 'seq')));
        $this->assertTrue(\Nevela\Laravel\Activity\Chain::verify()['ok']);

        // Everyone else who may see products is told of the create, delete and restore. A change isn't.
        $this->assertSame(['Ada created a product: Kettle KET-1', 'Ada deleted a product: Kettle, steel', 'Ada restored a product: Kettle, steel'], array_column($this->bellOf($bo), 'title'));
        $this->assertSame(["/dashboard/products/{$id}", '/dashboard/trash?in=products', "/dashboard/products/{$id}"], array_column($this->bellOf($bo), 'url'));
        $this->assertSame([], $this->bellOf($ada), 'nobody is told what they did');
        $this->assertSame([], $this->bellOf($nobody), 'nor what they may not see');

        // Deleted again within two minutes: an entry of its own, shown on the same line, counted.
        // Then removed for good from the trash: noted, and nobody is told.
        $this->deleteJson("/api/products/{$id}")->assertNoContent();
        $this->deleteJson("/api/_nevela/trash/products/{$id}")->assertNoContent();
        $this->assertCount(6, $this->activity(), 'every entry kept as written');
        $lines = $this->lines($ada);
        // A line is as recent as its latest entry: the second delete was after the restore.
        $this->assertSame(['created', 'updated', 'restored', 'deleted', 'purged'], array_column($lines, 'action'));
        $this->assertSame(2, $lines[3]['count']);
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

        // Stored as sent: one entry for the five, one for each delete. Shown as two lines.
        $this->assertSame([5, 1, 1, 1], array_map('intval', array_column($this->activity(), 'count')));
        $lines = $this->lines($ada);
        $this->assertSame(['created', 'deleted'], array_column($lines, 'action'));
        $this->assertSame([5, 3], array_column($lines, 'count'));

        $bell = $this->bellOf($bo);
        $this->assertSame(['Ada created 5 products', 'Ada deleted 3 products'], array_column($bell, 'title'));
        $this->assertSame([5, 3], array_map('intval', array_column($bell, 'count')));
        $this->assertSame(['/dashboard/products', '/dashboard/trash?in=products'], array_column($bell, 'url'));

        // A while later, the next is a row of its own; the bell's line, still unread, keeps counting.
        Carbon::setTestNow(now()->addMinutes(5));
        $this->deleteJson("/api/products/{$ids[3]}")->assertNoContent();
        $this->assertSame([5, 3, 1], array_column($this->lines($ada), 'count'));
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

    public function test_a_deletion_leads_to_the_trash_only_for_those_who_may_use_it(): void
    {
        $ada = $this->user('Ada', 'ADMIN');
        Role::query()->create(['name' => 'Watcher', 'description' => null, 'grants' => ['products.view', 'activity.view'], 'is_system' => false]);
        $watcher = $this->user('Wen', 'Watcher');
        $bo = $this->user('Bo', 'EDITOR');

        Sanctum::actingAs($ada);
        $id = $this->postJson('/api/products', $this->kettle('KET-1'))->assertCreated()->json('id');
        $this->deleteJson("/api/products/{$id}")->assertNoContent();

        $this->assertSame('/dashboard/trash?in=products', collect($this->bellOf($bo))->last()->url);
        $this->assertSame('/dashboard/products', collect($this->bellOf($watcher))->last()->url);
        $this->assertCount(2, $this->bellOf($watcher), 'told once, not once as a viewer and again as a deleter');

        $this->getJson('/api/_nevela/activity?action=deleted')->assertJsonPath('data.0.url', '/dashboard/trash?in=products');
        Sanctum::actingAs($watcher);
        $this->getJson('/api/_nevela/activity?action=deleted')->assertJsonPath('data.0.url', '/dashboard/products');
    }

    public function test_before_the_migration_the_log_says_so(): void
    {
        Sanctum::actingAs($this->user('Ada', 'ADMIN'));
        Schema::drop('nevela_activity');
        SchemaFacts::forget();

        // Changes still work, and are only not kept.
        $this->postJson('/api/products', $this->kettle('KET-1'))->assertCreated();
        $this->getJson('/api/_nevela/activity')->assertStatus(409)->assertJsonPath('code', 'MIGRATION_NEEDED');
    }

    public function test_old_rows_are_pruned(): void
    {
        Sanctum::actingAs($this->user('Ada', 'ADMIN'));
        $this->postJson('/api/products', $this->kettle('KET-1'))->assertCreated();
        $this->postJson('/api/products', $this->kettle('KET-2'))->assertCreated();
        Carbon::setTestNow(now()->addDays(Activity::KEEP_DAYS - 1));
        $this->postJson('/api/products', $this->kettle('KET-3'))->assertCreated();
        Carbon::setTestNow(now()->addDays(2));

        // The two old ones go, as a run from the start; the chain still checks, from where it now starts.
        $this->assertSame(2, Activity::prune());
        $this->assertSame([3], array_map('intval', array_column($this->activity(), 'seq')));
        $this->assertTrue(\Nevela\Laravel\Activity\Chain::verify()['ok'], \Nevela\Laravel\Activity\Chain::verify()['message']);
        // And the next entry follows on.
        $this->postJson('/api/products', $this->kettle('KET-4'))->assertCreated();
        $this->assertTrue(\Nevela\Laravel\Activity\Chain::verify()['ok']);
    }

    public function test_an_entry_changed_or_removed_in_the_database_is_caught(): void
    {
        Sanctum::actingAs($this->user('Ada', 'ADMIN'));
        foreach (range(1, 4) as $n) {
            $this->postJson('/api/products', $this->kettle("KET-{$n}"))->assertCreated();
            Carbon::setTestNow(now()->addMinutes(3));
        }
        $verify = fn () => \Nevela\Laravel\Activity\Chain::verify();
        $this->assertSame(['ok' => true, 'checked' => 4], array_intersect_key($verify(), ['ok' => 0, 'checked' => 0]));
        $snapshot = DB::table('nevela_activity')->get()->map(fn ($row) => (array) $row)->all();
        $head = (array) DB::table('nevela_activity_head')->first();
        $restore = function () use ($snapshot, $head) {
            DB::table('nevela_activity')->delete();
            DB::table('nevela_activity')->insert($snapshot);
            DB::table('nevela_activity_head')->where('id', 1)->update($head);
        };

        // A label edited.
        DB::table('nevela_activity')->where('seq', 2)->update(['label' => 'Something else']);
        $this->assertSame(2, $verify()['brokenAt']);
        $restore();

        // An entry from the middle deleted.
        DB::table('nevela_activity')->where('seq', 3)->delete();
        $this->assertFalse($verify()['ok']);
        $this->assertSame(4, $verify()['brokenAt']);
        $restore();

        // The newest deleted: the sealed head says there was one more.
        DB::table('nevela_activity')->where('seq', 4)->delete();
        $this->assertStringContainsString('newest entries were deleted', $verify()['message']);
        $restore();

        // An entry written in by hand, with no seal, or with a made-up one outside the chain.
        DB::table('nevela_activity')->insert(['id' => (string) \Illuminate\Support\Str::uuid7(), 'user_id' => '1', 'action' => 'deleted', 'resource' => 'Product', 'count' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertStringContainsString('no seal', $verify()['message']);
        DB::table('nevela_activity')->whereNull('seq')->update(['hash' => str_repeat('a', 64), 'key_id' => 'zzz']);
        $this->assertStringContainsString('no seal', $verify()['message']);
        DB::table('nevela_activity')->whereNull('seq')->delete();

        // An entry changed and given a key this app doesn't hold, to dodge the check.
        DB::table('nevela_activity')->where('seq', 3)->update(['label' => 'Hidden', 'key_id' => 'zzz']);
        $this->assertSame(3, $verify()['brokenAt']);
        $restore();

        // The newest deleted, and the head pointed at the new last one under a made-up key.
        DB::table('nevela_activity')->where('seq', 4)->delete();
        DB::table('nevela_activity_head')->where('id', 1)->update(['seq' => 3, 'hash' => $snapshot[2]['hash'], 'key_id' => 'zzz']);
        $this->assertFalse($verify()['ok']);
        $restore();

        // The oldest deleted, behind a prune record under a made-up key.
        DB::table('nevela_activity')->where('seq', 1)->delete();
        DB::table('nevela_activity_anchors')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'kind' => 'prune', 'seq' => 2, 'prev_hash' => $snapshot[0]['hash'], 'removed' => 1, 'at' => now()->format('Y-m-d H:i:s'), 'key_id' => 'zzz', 'seal' => str_repeat('0', 64)]);
        $this->assertFalse($verify()['ok']);
        DB::table('nevela_activity_anchors')->where('kind', 'prune')->delete();
        $restore();

        // A prune record forged, to hide removing the oldest.
        DB::table('nevela_activity')->where('seq', 1)->delete();
        DB::table('nevela_activity_anchors')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'kind' => 'prune', 'seq' => 2, 'prev_hash' => $snapshot[0]['hash'], 'removed' => 1, 'at' => now()->format('Y-m-d H:i:s'), 'key_id' => $snapshot[0]['key_id'], 'seal' => str_repeat('0', 64)]);
        $this->assertStringContainsString('forged', $verify()['message']);
        DB::table('nevela_activity_anchors')->where('kind', 'prune')->delete();
        $restore();
        $this->assertTrue($verify()['ok']);

        // APP_KEY rotated, the old one kept in APP_PREVIOUS_KEYS: older entries still check.
        $old = config('app.key');
        config(['app.key' => 'base64:'.base64_encode(random_bytes(32)), 'app.previous_keys' => [$old]]);
        $this->postJson('/api/products', $this->kettle('KET-5'))->assertCreated();
        $this->assertSame(['ok' => true, 'checked' => 5], array_intersect_key($verify(), ['ok' => 0, 'checked' => 0]));
        // Without it: in order, but not checkable, which deploy:check says.
        config(['app.previous_keys' => []]);
        $this->assertSame(4, $verify()['unverifiable']);
        $this->assertTrue($verify()['ok']);
    }
}
