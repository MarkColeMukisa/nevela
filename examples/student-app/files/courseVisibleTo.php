    /** Which courses someone sees: a teacher, their own. Anyone else who may see courses, all of them. */
    public function scopeVisibleTo(\Illuminate\Database\Eloquent\Builder $query, User $user): void
    {
        if ($teacher = Teacher::of($user)) {
            $query->where('teacher_id', $teacher->id);
        }
    }
