    /** Which products anyone may see: the ones on sale. */
    public function scopePublicQuery(\Illuminate\Database\Eloquent\Builder $query): void
    {
        $query->where('active', true);
    }
