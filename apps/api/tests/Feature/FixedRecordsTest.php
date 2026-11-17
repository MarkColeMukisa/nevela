<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Portion;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Models\Role;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * A fixed resource: a booking, once placed, is not edited or deleted by anyone signed in,
 * the administrator included, and neither are its lines. It moves on through its actions,
 * each a step in its history, which the customer reads and is told of.
 */
class FixedRecordsTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private User $admin;

    private User $staff;

    private User $amara;

    private User $bo;

    private Product $kettle;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->resources(fn () => [
            Descriptor::fromArray([
                'name' => 'Booking',
                'fixed' => true,
                'owner' => 'email',
                'items' => 'Portion',
                'fields' => [
                    'customer' => ['kind' => 'string'],
                    'email' => ['kind' => 'string', 'format' => 'email', 'required' => false],
                    'status' => ['kind' => 'enum', 'options' => ['pending', 'accepted', 'ready', 'cancelled'], 'default' => 'pending'],
                    'total' => ['kind' => 'float', 'format' => 'money', 'required' => false],
                    'paid' => ['kind' => 'boolean', 'default' => false],
                    'dueAt' => ['kind' => 'datetime', 'required' => false],
                ],
                'actions' => [
                    'accept' => ['label' => 'Accept', 'when' => ['status' => 'pending'], 'set' => ['status' => 'accepted']],
                    'markReady' => ['label' => 'Ready', 'when' => ['status' => 'accepted'], 'set' => ['status' => 'ready']],
                    'cancel' => ['label' => 'Cancel', 'when' => ['status' => 'pending'], 'set' => ['status' => 'cancelled'], 'confirm' => 'Cancel this booking?'],
                    'decline' => ['label' => 'Cancel with a reason', 'when' => ['status' => ['pending', 'accepted']], 'set' => ['status' => 'cancelled'], 'fields' => ['reason' => ['kind' => 'text']]],
                ],
            ]),
            Descriptor::fromArray([
                'name' => 'Portion',
                'fields' => [
                    'bookingId' => ['kind' => 'belongsTo', 'target' => 'Booking'],
                    'productId' => ['kind' => 'belongsTo', 'target' => 'Product'],
                    'quantity' => ['kind' => 'int'],
                ],
            ]),
        ]);
        Access::reset();
        Permissions::forget();
        Role::query()->create(['name' => 'CUSTOMER', 'description' => null, 'grants' => ['bookings.view', 'bookings.create', 'bookings.cancel', 'portions.view', 'portions.create', 'products.view'], 'is_system' => false]);
        Role::query()->create(['name' => 'STAFF', 'description' => null, 'grants' => ['bookings.*', 'bookings.accept', 'bookings.mark_ready', 'bookings.decline', 'portions.*', 'products.view'], 'is_system' => false]);
        $this->admin = User::factory()->create(['name' => 'Ada']);
        Access::grant($this->admin, 'ADMIN');
        $this->staff = User::factory()->create(['name' => 'Mercy Auma']);
        Access::grant($this->staff, 'STAFF');
        $this->amara = User::factory()->create(['name' => 'Amara', 'email' => 'amara@example.com']);
        Access::grant($this->amara, 'CUSTOMER');
        $this->bo = User::factory()->create(['name' => 'Bo', 'email' => 'bo@example.com']);
        Access::grant($this->bo, 'CUSTOMER');
        $category = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);
        $this->kettle = Product::create(['name' => 'Kettle', 'sku' => 'KET-1', 'price' => 49.5, 'category_id' => $category->id, 'active' => true, 'kind' => 'stock']);
    }

    /** Amara places a booking of two kettles, from her phone. */
    private function placed(): string
    {
        Sanctum::actingAs($this->amara);

        return $this->postJson('/api/bookings', ['customer' => 'Amara', 'items' => [['productId' => $this->kettle->id, 'quantity' => 2]]])->assertCreated()->json('id');
    }

    public function test_a_booking_is_finished_in_the_request_that_makes_it_and_a_customer_cant_choose_its_status(): void
    {
        // As an order's itemsSaved() does: the total, worked out once the lines are saved.
        Event::listen('eloquent.created: '.Portion::class, function (Portion $line) {
            Booking::query()->find($line->booking_id)?->update(['total' => 99]);
        });
        Sanctum::actingAs($this->amara);
        $response = $this->postJson('/api/bookings', ['customer' => 'Amara', 'status' => 'ready', 'items' => [['productId' => $this->kettle->id, 'quantity' => 2]]])->assertCreated();

        $this->assertSame('pending', $response->json('status'));
        $this->assertEquals(99, $response->json('total'));
        $this->assertCount(1, $response->json('items'));

        // Staff, who may edit bookings, keep what they send when they take one for someone.
        Sanctum::actingAs($this->staff);
        $this->postJson('/api/bookings', ['customer' => 'Walk-in', 'status' => 'accepted'])->assertCreated()->assertJsonPath('status', 'accepted');
    }

    public function test_nobody_signed_in_edits_or_deletes_a_placed_booking_not_even_the_administrator(): void
    {
        $id = $this->placed();

        // Amara may not edit bookings at all: she is refused before it comes to that.
        $this->patchJson("/api/bookings/{$id}", ['status' => 'ready'])->assertForbidden();
        foreach ([$this->admin, $this->staff] as $who) {
            Sanctum::actingAs($who);
            $this->patchJson("/api/bookings/{$id}", ['status' => 'ready'])
                ->assertStatus(409)
                ->assertJsonPath('error', "This booking can't be changed once it is made. What can still be done to it is on its page.");
            $this->putJson("/api/bookings/{$id}", ['customer' => 'Someone else', 'status' => 'pending'])->assertStatus(409);
        }
        Sanctum::actingAs($this->admin);
        $this->deleteJson("/api/bookings/{$id}")->assertStatus(409);

        $booking = Booking::query()->find($id);
        $this->assertNotNull($booking);
        $this->assertSame('pending', $booking->status);
        $this->assertSame('Amara', $booking->customer);
    }

    public function test_its_lines_are_fixed_with_it(): void
    {
        $id = $this->placed();
        $line = Portion::query()->where('booking_id', $id)->firstOrFail();

        Sanctum::actingAs($this->admin);
        $this->patchJson("/api/bookings/{$id}", ['items' => [['productId' => $this->kettle->id, 'quantity' => 9]]])->assertStatus(409);
        $this->postJson('/api/portions', ['bookingId' => $id, 'productId' => $this->kettle->id, 'quantity' => 1])->assertStatus(409);
        $this->patchJson("/api/portions/{$line->id}", ['quantity' => 5])->assertStatus(409);
        $this->deleteJson("/api/portions/{$line->id}")->assertStatus(409);

        $this->assertSame([2], Portion::query()->where('booking_id', $id)->pluck('quantity')->all());
    }

    public function test_the_console_and_seeders_still_can(): void
    {
        $id = $this->placed();
        $this->app['auth']->forgetGuards();

        Booking::query()->findOrFail($id)->update(['status' => 'ready']);
        $this->assertSame('ready', Booking::query()->find($id)->status);
        Booking::query()->findOrFail($id)->delete();
        $this->assertNull(Booking::query()->find($id));
    }

    public function test_staff_move_it_along_and_each_step_is_in_its_history_and_told_to_the_customer(): void
    {
        $id = $this->placed();
        // Values that come back from the database in another form than the model gives them
        // (a total, a yes, a time): none of them changes, so none of them is in a step.
        $this->app['auth']->forgetGuards();
        Booking::query()->findOrFail($id)->update(['total' => 60000, 'paid' => true, 'due_at' => now()->addHour()]);

        Sanctum::actingAs($this->staff);
        $this->postJson("/api/bookings/{$id}/_actions/accept")->assertOk()->assertJsonPath('record.status', 'accepted');
        $this->postJson("/api/bookings/{$id}/_actions/accept")->assertStatus(409)->assertJsonPath('code', 'NOT_APPLICABLE');
        $this->postJson("/api/bookings/{$id}/_actions/markReady")->assertOk()->assertJsonPath('record.status', 'ready');

        // Amara reads where it has got to, and who moved it.
        Sanctum::actingAs($this->amara);
        $history = $this->getJson("/api/_nevela/history/bookings/{$id}")->assertOk()->json('data');
        $this->assertSame(['accept', 'markReady'], array_column($history, 'action'));
        $this->assertSame('Mercy Auma', $history[0]['user']['name']);
        $this->assertSame(['status' => ['from' => 'pending', 'to' => 'accepted']], $history[0]['changes']);
        $this->assertSame(['status' => ['from' => 'accepted', 'to' => 'ready']], $history[1]['changes']);

        // And was told, each time.
        $titles = array_column($this->getJson('/api/_nevela/notifications')->assertOk()->json('items'), 'title');
        $this->assertContains('Your booking Amara is now Accepted', $titles);
        $this->assertContains('Your booking Amara is now Ready', $titles);

        // Bo can't read it: for him it isn't there.
        Sanctum::actingAs($this->bo);
        $this->getJson("/api/_nevela/history/bookings/{$id}")->assertNotFound();
    }

    public function test_a_customer_cancels_while_it_is_pending_and_staff_say_why(): void
    {
        $id = $this->placed();

        // Amara may cancel, and may not accept: each action is its own permission.
        $this->postJson("/api/bookings/{$id}/_actions/accept")->assertForbidden();
        $this->postJson("/api/bookings/{$id}/_actions/cancel")->assertOk()->assertJsonPath('record.status', 'cancelled');
        $this->postJson("/api/bookings/{$id}/_actions/cancel")->assertStatus(409);
        // Nobody else's: Bo can't cancel Amara's.
        $other = $this->placed();
        Sanctum::actingAs($this->bo);
        $this->postJson("/api/bookings/{$other}/_actions/cancel")->assertNotFound();

        // Staff cancel one that is under way, and have to say why. Amara is told it.
        Sanctum::actingAs($this->staff);
        $this->postJson("/api/bookings/{$other}/_actions/accept")->assertOk();
        $this->postJson("/api/bookings/{$other}/_actions/decline")->assertUnprocessable();
        $this->postJson("/api/bookings/{$other}/_actions/decline", ['input' => ['reason' => 'The kettles are sold out.']])->assertOk()->assertJsonPath('record.status', 'cancelled');

        Sanctum::actingAs($this->amara);
        $history = $this->getJson("/api/_nevela/history/bookings/{$other}")->json('data');
        $this->assertSame(['reason' => 'The kettles are sold out.'], $history[1]['input']);
        $told = collect($this->getJson('/api/_nevela/notifications')->json('items'))->firstWhere('title', 'Your booking Amara is now Cancelled');
        $this->assertNotNull($told);
        $this->assertSame('The kettles are sold out.', $told['body']);
    }

    public function test_a_customer_who_cancels_is_not_told_but_the_staff_are(): void
    {
        $id = $this->placed();
        $this->postJson("/api/bookings/{$id}/_actions/cancel")->assertOk();

        $titles = array_column($this->getJson('/api/_nevela/notifications')->json('items'), 'title');
        $this->assertNotContains('Your booking Amara is now Cancelled', $titles);

        // The people who run bookings hear of it, before they start on one that is off.
        Sanctum::actingAs($this->staff);
        $told = collect($this->getJson('/api/_nevela/notifications')->json('items'))->firstWhere('title', 'Booking Amara is now Cancelled');
        $this->assertNotNull($told);
        $this->assertSame('By Amara.', $told['body']);
        // Bo, another customer, hears nothing of it.
        Sanctum::actingAs($this->bo);
        $this->assertNotContains('Booking Amara is now Cancelled', array_column($this->getJson('/api/_nevela/notifications')->json('items'), 'title'));
    }
}
