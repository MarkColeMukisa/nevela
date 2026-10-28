    /** Called once its items are saved: the order's total is what they come to. */
    public function itemsSaved(): void
    {
        $this->update(['total' => round($this->orderItems()->get()->sum(fn (OrderItem $item) => $item->quantity * $item->price), 2)]);
    }
