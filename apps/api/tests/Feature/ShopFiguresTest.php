<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Support\Descriptor;
use Nevela\Laravel\Support\ShopFigures;
use Tests\TestCase;

/**
 * The shop at a glance (GET _nevela/shop-figures): today's orders against the same time last
 * week, what is pending, and sales this week against last, cancelled orders left out.
 */
class ShopFiguresTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Access::reset();
        $admin = User::factory()->create();
        Access::grant($admin, 'ADMIN');
        Sanctum::actingAs($admin);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function order(string $at, string $status, float $total): void
    {
        $order = Order::create(['customer' => 'Ada', 'status' => $status, 'total' => $total]);
        // Made when it says, and its total kept as given: the lines would work one out.
        DB::table('orders')->where('id', $order->id)->update(['created_at' => Carbon::parse($at), 'total' => $total]);
    }

    public function test_today_against_the_same_time_last_week_and_sales_without_the_cancelled(): void
    {
        Carbon::setTestNow('2026-11-22 15:00:00');
        $this->order('2026-11-22 08:00:00', 'pending', 10);
        $this->order('2026-11-22 14:59:00', 'paid', 20);
        $this->order('2026-11-22 09:00:00', 'cancelled', 1000);
        // Last Sunday: before 15:00 counts, after it doesn't.
        $this->order('2026-11-15 10:00:00', 'paid', 30);
        $this->order('2026-11-15 16:00:00', 'paid', 40);
        // Before last week entirely.
        $this->order('2026-11-01 10:00:00', 'pending', 5);

        $this->getJson('/api/_nevela/shop-figures')
            ->assertOk()
            ->assertJsonPath('orders.slug', 'orders')
            ->assertJsonPath('today.orders', 3)
            ->assertJsonPath('today.sameTimeLastWeek', 1)
            ->assertJsonPath('pending', 2)
            ->assertJsonPath('pendingStatus', 'pending')
            ->assertJsonPath('statusField', 'status')
            // The last seven days run from 15:00 last Sunday: 10 + 20 + 40 (the cancelled 1000
            // sold nothing). The seven before: 30. All of it: 105.
            ->assertJson(['sales' => ['total' => 105, 'week' => 70, 'lastWeek' => 30]]);
    }

    public function test_it_takes_permission_to_see_orders_and_an_app_without_a_shop_has_none(): void
    {
        // Someone with no role may see no orders, so no figures either.
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/_nevela/shop-figures')->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/shop-figures')->assertUnauthorized();

        // No order with lines among the resources: no shop to count.
        $empty = sys_get_temp_dir().'/nevela-no-shop-'.uniqid();
        mkdir($empty);
        config(['nevela.descriptors_path' => $empty]);
        \Nevela\Laravel\Nevela::forget();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/_nevela/shop-figures')->assertNotFound()->assertJsonPath('code', 'NO_SHOP');
        \Nevela\Laravel\Nevela::forget();
        rmdir($empty);
    }

    public function test_which_fields_the_figures_come_from(): void
    {
        $order = Descriptor::fromSpec('Booking', 'reference:string, amount:money, tip:money?, state:enum(new|confirmed|canceled|cancelled)=confirmed');
        $this->assertSame(['total' => 'amount', 'status' => 'state', 'pending' => 'confirmed', 'cancelled' => ['canceled', 'cancelled']], ShopFigures::fieldsOf($order));

        $plain = Descriptor::fromSpec('Visit', 'name:string, kind:enum(a|b)');
        $this->assertSame(['total' => null, 'status' => null, 'pending' => null, 'cancelled' => []], ShopFigures::fieldsOf($plain));
    }
}
