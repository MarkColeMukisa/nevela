    /** Which enrolments someone sees: a teacher, the ones in their courses. */
    public function scopeVisibleTo(\Illuminate\Database\Eloquent\Builder $query, User $user): void
    {
        if (Teacher::of($user)) {
            $query->whereHas('course', fn ($course) => $course->visibleTo($user));
        }
    }
