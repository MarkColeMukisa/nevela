    /** The teacher someone signs in as: the one with their email, if they teach. */
    public static function of(User $user): ?self
    {
        return static::query()->where('email', $user->email)->first();
    }
