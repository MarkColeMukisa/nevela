<?php

// What the tutorial does by hand in the dashboard, for CI, which has no one to click. Run
// from apps/api:
//
//   by-hand.php role CUSTOMER beverages.view categories.view …   a role, as on the Roles screen
//   by-hand.php menu                                             names for the seeded categories and drinks, and prices a bar would charge
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

[, $what] = $argv;
if ($what === 'role') {
    Nevela\Laravel\Models\Role::query()->create(['name' => $argv[2], 'description' => null, 'grants' => array_slice($argv, 3), 'is_system' => false]);
    echo "Role {$argv[2]}", PHP_EOL;
} elseif ($what === 'menu') {
    $menu = [
        'Juices' => [['Passion fruit', 3500], ['Mango', 3500], ['Pineapple', 3000], ['Watermelon', 3000]],
        'Smoothies' => [['Banana and oat', 5000], ['Berry blast', 6000], ['Green boost', 5500], ['Mango lassi', 5000]],
        'Shakes' => [['Vanilla', 6000], ['Chocolate', 6000], ['Strawberry', 6500], ['Caramel', 6500]],
        'Coffee' => [['Americano', 4000], ['Latte', 5000], ['Cappuccino', 5000], ['Iced coffee', 4500]],
    ];
    $categories = App\Models\Category::query()->orderBy('id')->get();
    $drinks = App\Models\Beverage::query()->orderBy('id')->get();
    $n = 0;
    foreach (array_keys($menu) as $i => $name) {
        $categories[$i]->update(['name' => $name]);
        foreach ($menu[$name] as [$drink, $price]) {
            $drinks[$n]->update(['name' => $drink, 'price' => $price, 'category_id' => $categories[$i]->id]);
            $n++;
        }
    }
    echo "Menu of {$n} drinks", PHP_EOL;
} else {
    fwrite(STDERR, "role or menu\n");
    exit(1);
}
