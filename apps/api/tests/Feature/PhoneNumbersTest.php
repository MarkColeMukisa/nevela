<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/**
 * A phone field held to one country. The dev app's orders have the customer's phone, a
 * Ugandan number (`"country": "UG"`): written any way people write one there, kept as one.
 */
class PhoneNumbersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
    }

    /** @return array<string, mixed> */
    private function order(?string $phone): array
    {
        return ['customer' => 'Grace Nakitende', 'status' => 'pending', 'phone' => $phone];
    }

    public function test_a_number_written_the_local_way_is_kept_with_its_code(): void
    {
        $id = $this->postJson('/api/orders', $this->order('0772 123 456'))
            ->assertCreated()
            ->assertJsonPath('phone', '+256772123456')
            ->json('id');

        $this->assertSame('+256772123456', Order::find($id)->phone);
        $this->patchJson("/api/orders/{$id}", ['phone' => '256 414 123456'])->assertOk()->assertJsonPath('phone', '+256414123456');
        // Optional, so it may be cleared.
        $this->patchJson("/api/orders/{$id}", ['phone' => null])->assertOk()->assertJsonPath('phone', null);
    }

    public function test_one_that_isn_t_a_ugandan_number_is_refused_and_says_what_one_is(): void
    {
        foreach (['+254 712 345678', '0772 12345', 'call me'] as $phone) {
            $this->postJson('/api/orders', $this->order($phone))
                ->assertUnprocessable()
                ->assertJsonPath('issues.0.path', 'phone')
                ->assertJsonPath('issues.0.message', 'Enter a Ugandan number, such as 0772 123456 or +256 772 123456.');
        }
        $this->assertSame(0, Order::count());
    }

    public function test_rows_sent_together_are_kept_the_same_way(): void
    {
        $this->postJson('/api/orders/_bulk', ['items' => [$this->order('0701 234567'), $this->order('+256 392 123456')]])->assertSuccessful();

        $this->assertSame(['+256392123456', '+256701234567'], Order::orderBy('phone')->pluck('phone')->all());

        $this->postJson('/api/orders/_bulk', ['items' => [$this->order('0701 234567'), $this->order('12345')]])
            ->assertUnprocessable()
            ->assertJsonPath('rows.0.row', 2)
            ->assertJsonPath('rows.0.issues.0.message', 'Enter a Ugandan number, such as 0772 123456 or +256 772 123456.');
    }
}
