<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Tests\TestCase;

/** --count is how many the table should hold. The dev app's categories and orders are seeded to one. */
class SeedToATargetTest extends TestCase
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

    private function seed_(int $count, array $options = []): \Illuminate\Testing\PendingCommand
    {
        return $this->artisan('nevela:seed', ['name' => 'Order', '--count' => $count] + $options);
    }

    public function test_it_seeds_what_is_missing(): void
    {
        $this->seed_(5)->assertSuccessful();
        $this->assertSame(5, Order::query()->count());

        $this->seed_(8)->assertSuccessful();
        $this->assertSame(8, Order::query()->count());
    }

    public function test_run_again_it_says_so_and_does_nothing(): void
    {
        $this->seed_(5)->assertSuccessful();

        $this->seed_(5)
            ->expectsOutputToContain('5 Orders are there, and you asked for 5. Nothing to seed.')
            ->assertSuccessful();
        $this->assertSame(5, Order::query()->count());
    }

    public function test_it_never_removes_any_to_reach_the_number(): void
    {
        $this->seed_(5)->assertSuccessful();

        $this->seed_(2)->expectsOutputToContain('5 Orders are there, and you asked for 2.')->assertSuccessful();
        $this->assertSame(5, Order::query()->count());
    }

    public function test_fresh_replaces_them_with_that_many(): void
    {
        $this->seed_(5)->assertSuccessful();

        $this->seed_(2, ['--fresh' => true])->assertSuccessful();
        $this->assertSame(2, Order::query()->count());

        // Even when that is as many as there were.
        $this->seed_(2, ['--fresh' => true])->assertSuccessful();
        $this->assertSame(2, Order::query()->count());
        $this->assertSame(['ORD-0001', 'ORD-0002'], Order::query()->orderBy('number')->pluck('number')->all());
    }

    public function test_what_is_in_the_trash_does_not_count_as_the_list_does_not_show_it(): void
    {
        $this->seed_(5)->assertSuccessful();
        Order::query()->orderBy('number')->first()->delete();
        $this->assertSame(4, Order::query()->count());

        $this->seed_(5)->assertSuccessful();

        $this->assertSame(5, Order::query()->count());
        $this->assertSame(6, Order::query()->withTrashed()->count());
    }

    public function test_more_than_a_batch_is_seeded_exactly_and_numbered_without_a_gap(): void
    {
        $this->seed_(5200)->assertSuccessful();

        $this->assertSame(5200, Order::query()->count());
        $this->assertSame('ORD-5200', DB::table('orders')->orderByRaw('length(number) desc')->orderByDesc('number')->value('number'));
        $this->assertSame(5200, DB::table('orders')->distinct()->count('number'));
    }

    public function test_seeded_unique_values_go_on_from_what_the_table_holds_and_stay_readable(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Category', '--count' => 3])->assertSuccessful();
        $this->artisan('nevela:seed', ['name' => 'Category', '--count' => 6])->assertSuccessful();

        $this->assertSame(6, Category::query()->count());
        $this->assertSame(6, DB::table('categories')->distinct()->count('slug'));
        foreach (Category::query()->pluck('slug') as $slug) {
            $this->assertDoesNotMatchRegularExpression('/\d{5,}/', $slug, 'a large number from a random block');
        }
    }

    public function test_a_value_an_earlier_run_used_higher_up_is_stepped_around(): void
    {
        // A slug that the next numbers would meet, as an earlier run's or a person's can be.
        Category::create(['name' => 'Taken', 'slug' => 'taken']);
        $this->artisan('nevela:seed', ['name' => 'Category', '--count' => 40])->assertSuccessful();

        $this->assertSame(40, Category::query()->count());
    }
}
