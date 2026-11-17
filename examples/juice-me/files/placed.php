    protected static function booted(): void
    {
        static::creating(function (Order $order): void {
            $user = request()->user();
            if ($user === null || $user->can('orders.edit')) {
                return; // staff, a seeder, the console: whatever they send is kept
            }
            // A customer's order is numbered and priced by Laravel. Whatever the request said
            // for these is ignored: they aren't for the person it helps to choose.
            $order->total = null;
            $order->number = \Nevela\Laravel\Support\Numbering::next($order->getTable(), 'number', 'JM');
        });
    }
