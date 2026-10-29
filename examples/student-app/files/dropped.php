    /** A student who drops a course: their teacher is told, in the bell. */
    protected static function booted(): void
    {
        static::updated(function (Enrolment $enrolment) {
            if (! $enrolment->wasChanged('status') || $enrolment->status !== 'dropped') {
                return;
            }
            $teacher = User::query()->where('email', $enrolment->course->teacher->email)->first();
            if ($teacher !== null) {
                \Nevela\Laravel\Notices\Notices::send($teacher, new \Nevela\Laravel\Notices\Notice(
                    "{$enrolment->student->name} dropped {$enrolment->course->title}",
                    url: "/dashboard/enrolments/{$enrolment->id}",
                    tone: 'warning',
                ));
            }
        });
    }
