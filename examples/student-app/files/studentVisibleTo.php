    /** Which students someone sees: a teacher, the ones enrolled in their courses. */
    public function scopeVisibleTo(\Illuminate\Database\Eloquent\Builder $query, User $user): void
    {
        if (Teacher::of($user)) {
            $query->whereHas('enrolments', fn ($enrolment) => $enrolment->visibleTo($user));
        }
    }
