<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Activity\Activity;
use Nevela\Laravel\Models\Role;
use Tests\TestCase;

/**
 * Which records each person sees, where the model says so with a visibleTo scope. The dev
 * app's orders have one: whoever may change orders sees them all, and someone who may only
 * look sees the ones placed with their email.
 */
class VisibleRecordsTest extends TestCase
{
    use RefreshDatabase;

    private User $ada;

    private User $customer;

    private Order $mine;

    private Order $theirs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        Permissions::forget();
        Order::forgetTrash();
        Activity::forget();
        Role::query()->create(['name' => 'CUSTOMER', 'description' => null, 'grants' => ['orders.view', 'orders.delete', 'order_items.view', 'order_items.create', 'products.view'], 'is_system' => false]);
        $this->ada = User::factory()->create(['name' => 'Ada']);
        Access::grant($this->ada, 'ADMIN');
        $this->customer = User::factory()->create(['name' => 'Amara', 'email' => 'amara@example.com']);
        Access::grant($this->customer, 'CUSTOMER');
        // Made by nobody signed in, as seeding is: nobody is told, and nothing is narrowed.
        $this->mine = Order::create(['customer' => 'Amara', 'email' => 'amara@example.com', 'status' => 'pending']);
        Order::create(['customer' => 'Amara', 'email' => 'amara@example.com', 'status' => 'paid']);
        $this->theirs = Order::create(['customer' => 'Bo', 'email' => 'bo@example.com', 'status' => 'pending']);
    }

    public function test_the_list_and_what_is_counted_from_it_are_what_each_person_sees(): void
    {
        Sanctum::actingAs($this->customer);
        $this->getJson('/api/orders')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonMissing(['email' => 'bo@example.com']);
        $this->getJson('/api/orders/_stats?field=status')->assertOk()->assertJsonPath('total', 2)->assertJsonPath('values.paid', 1);
        $this->getJson('/api/orders/_insights')->assertOk()->assertJsonPath('total', 2);

        Sanctum::actingAs($this->ada);
        $this->getJson('/api/orders')->assertOk()->assertJsonPath('meta.total', 3);
        $this->getJson('/api/orders/_stats')->assertOk()->assertJsonPath('total', 3);
    }

    public function test_a_record_someone_may_not_see_is_not_there_for_them(): void
    {
        Sanctum::actingAs($this->customer);
        $this->getJson("/api/orders/{$this->mine->id}")->assertOk();
        $this->getJson("/api/orders/{$this->theirs->id}")->assertNotFound();
        // Not "you may not": that would say it exists.
        $this->patchJson("/api/orders/{$this->theirs->id}", ['status' => 'paid'])->assertNotFound();
        $this->patchJson("/api/orders/{$this->mine->id}", ['status' => 'paid'])->assertForbidden();
        $this->deleteJson("/api/orders/{$this->theirs->id}")->assertNotFound();
        $this->assertNotSoftDeleted($this->theirs);
        $this->deleteJson("/api/orders/{$this->mine->id}")->assertNoContent();
    }

    public function test_the_trash_holds_only_what_they_could_see(): void
    {
        $this->mine->delete();
        $this->theirs->delete();

        Sanctum::actingAs($this->customer);
        $counts = collect($this->getJson('/api/_nevela/trash')->assertOk()->json('resources'))->pluck('count', 'slug');
        $this->assertSame(1, $counts['orders']);
        $this->assertSame([$this->mine->id], array_column($this->getJson('/api/_nevela/trash/orders')->assertOk()->json('data'), 'id'));
        $this->postJson("/api/_nevela/trash/orders/{$this->theirs->id}/restore")->assertNotFound();
        $this->deleteJson("/api/_nevela/trash/orders/{$this->theirs->id}")->assertNotFound();
        $this->assertSoftDeleted($this->theirs);
    }

    public function test_a_relation_points_only_at_a_record_they_may_see(): void
    {
        $product = Product::create(['name' => 'Kettle', 'sku' => 'KET-1', 'price' => 10, 'category_id' => Category::create(['name' => 'Kitchen', 'slug' => 'kitchen'])->id, 'active' => true, 'kind' => 'stock']);

        Sanctum::actingAs($this->customer);
        $this->postJson('/api/order-items', ['orderId' => $this->theirs->id, 'productId' => $product->id, 'quantity' => 1])
            ->assertUnprocessable()->assertJsonPath('issues.0.path', 'orderId');
        $this->postJson('/api/order-items', ['orderId' => $this->mine->id, 'productId' => $product->id, 'quantity' => 1])->assertCreated();
        // Many at once are held to the same.
        $this->postJson('/api/order-items/_bulk', ['items' => [['orderId' => $this->theirs->id, 'productId' => $product->id, 'quantity' => 1]]])
            ->assertUnprocessable()->assertJsonPath('rows.0.issues.0.path', 'orderId');
    }

    public function test_the_bell_tells_each_person_of_what_they_may_see(): void
    {
        Sanctum::actingAs($this->ada);
        $this->postJson('/api/orders', ['customer' => 'Amara', 'email' => 'amara@example.com', 'status' => 'pending'])->assertCreated();
        $this->postJson('/api/orders', ['customer' => 'Bo', 'email' => 'bo@example.com', 'status' => 'pending'])->assertCreated();
        $this->postJson('/api/orders/_bulk', ['items' => [
            ['customer' => 'Amara', 'email' => 'amara@example.com', 'status' => 'pending'],
            ['customer' => 'Bo', 'email' => 'bo@example.com', 'status' => 'pending'],
            ['customer' => 'Bo', 'email' => 'bo@example.com', 'status' => 'pending'],
        ]])->assertCreated();

        // The two of hers, counted as two: not the five Ada made, and nothing about Bo's.
        $titles = DB::table('nevela_notifications')->where('user_id', (string) $this->customer->getKey())->pluck('title')->all();
        $this->assertSame(['Ada created 2 orders'], $titles);
    }

    public function test_a_deletion_is_told_of_to_those_who_could_see_the_record(): void
    {
        Sanctum::actingAs($this->ada);
        $this->deleteJson("/api/orders/{$this->theirs->id}")->assertNoContent();
        $this->deleteJson("/api/orders/{$this->mine->id}")->assertNoContent();

        // She may delete orders, so hers leads to the trash. Bo's isn't told to her.
        $bell = DB::table('nevela_notifications')->where('user_id', (string) $this->customer->getKey())->get(['title', 'url'])->all();
        $this->assertSame(["Ada deleted an order: {$this->mine->number}"], array_column($bell, 'title'));
        $this->assertSame(['/dashboard/trash?in=orders'], array_column($bell, 'url'));
    }
}
