<?php

/*
 * What two of the actions below do. In an app these are the files Nevela writes once,
 * app/Nevela/Actions/<Resource>/<Action>.php, filled in. The third, Archive, is left as
 * it is generated, to see what an action nobody has written yet says for itself.
 */

namespace App\Nevela\Actions\Applicant {
    use App\Models\Applicant;
    use Tests\Feature\ActionsTest;

    class Accept
    {
        public function handle(Applicant $applicant, array $input): ?string
        {
            $applicant->update(['accepted_at' => now()]);
            if ($applicant->name === 'Unlucky') {
                throw new \RuntimeException('The mail server is down.');
            }
            ActionsTest::$letters[] = $applicant->email;

            return "Accepted {$applicant->name}. Their letter is on its way.";
        }
    }
}

namespace App\Nevela\Actions\Subscriber {
    use App\Models\Subscriber;
    use Tests\Feature\ActionsTest;

    class Announce
    {
        public function handle(array $input): ?string
        {
            ActionsTest::$announcements[] = $input;

            return 'Queued for '.Subscriber::query()->count().' subscribers.';
        }
    }
}

namespace Tests\Feature {
    use App\Models\Applicant;
    use App\Models\Subscriber;
    use App\Models\User;
    use Illuminate\Foundation\Testing\RefreshDatabase;
    use Laravel\Sanctum\Sanctum;
    use Nevela\Laravel\Access\Access;
    use Nevela\Laravel\Access\Permissions;
    use Nevela\Laravel\Models\Role;
    use Nevela\Laravel\Support\Descriptor;
    use Tests\GeneratesResources;
    use Tests\TestCase;

    /**
     * A resource's own actions, over HTTP: accepting an application, and sending an
     * announcement to everyone on a list. Each has a route, a permission of its own, and
     * a class that does it; Nevela is everything in between.
     */
    class ActionsTest extends TestCase
    {
        use GeneratesResources, RefreshDatabase;

        /** @var list<string> */
        public static array $letters = [];

        /** @var list<array<string, mixed>> */
        public static array $announcements = [];

        private Applicant $amara;

        protected function setUp(): void
        {
            parent::setUp();
            self::$letters = self::$announcements = [];
            $this->resources(fn () => [
                Descriptor::fromArray([
                    'name' => 'Applicant',
                    'fields' => ['name' => ['kind' => 'string'], 'email' => ['kind' => 'string', 'format' => 'email'], 'acceptedAt' => ['kind' => 'datetime', 'required' => false]],
                    'actions' => [
                        'accept' => ['label' => 'Accept', 'icon' => 'check', 'on' => 'record', 'confirm' => 'Send the acceptance letter to this applicant?', 'when' => ['acceptedAt' => null], 'many' => true],
                        'archive' => ['on' => 'record'],
                    ],
                ]),
                Descriptor::fromArray([
                    'name' => 'Subscriber',
                    'fields' => ['email' => ['kind' => 'string', 'format' => 'email', 'unique' => true]],
                    'actions' => [
                        'announce' => ['label' => 'Send announcement', 'icon' => 'megaphone', 'on' => 'collection', 'fields' => ['subject' => ['kind' => 'string'], 'message' => ['kind' => 'text'], 'urgent' => ['kind' => 'boolean', 'required' => false]]],
                    ],
                ]),
            ]);

            Access::reset();
            Permissions::forget();
            $this->amara = Applicant::create(['name' => 'Amara', 'email' => 'amara@example.com']);
            $this->actingAsRole('ADMIN');
        }

        private function actingAsRole(string $role): User
        {
            $user = User::factory()->create();
            $this->assertTrue(Access::grant($user, $role), "no role called {$role}");
            Sanctum::actingAs($user->refresh());

            return $user;
        }

        // --- what is generated

        public function test_an_action_gets_a_class_written_once_and_the_dashboard_is_told_of_it(): void
        {
            $stub = (string) file_get_contents(self::$dir.'/api/app/Nevela/Actions/Applicant/Archive.php');
            $this->assertStringContainsString('namespace App\Nevela\Actions\Applicant;', $stub);
            $this->assertStringContainsString('public function handle(Applicant $applicant, array $input): ?string', $stub);
            $this->assertStringContainsString('"applicants.archive"', $stub);

            // An action on the list as a whole has no record to be handed.
            $announce = (string) file_get_contents(self::$dir.'/api/app/Nevela/Actions/Subscriber/Announce.php');
            $this->assertStringContainsString('public function handle(array $input): ?string', $announce);
            $this->assertStringContainsString('subject, message, urgent', $announce);

            // Its label when none is given is its name in words; the descriptor keeps what it was given.
            $this->assertSame('Archive', $this->descriptor('Applicant')->actions['archive']->label);
            $this->assertSame(['acceptedAt' => null], $this->descriptor('Applicant')->actions['accept']->when);
        }

        // --- who may

        public function test_each_action_is_a_permission_of_its_own(): void
        {
            foreach (['applicants.accept', 'applicants.archive', 'subscribers.announce'] as $key) {
                $this->assertContains($key, Permissions::keys());
                $this->assertTrue(Permissions::isPermission($key));
            }
            // Not everything with a dot in it is Nevela's to answer for.
            $this->assertFalse(Permissions::isPermission('applicants.publish'));
            $this->assertFalse(Permissions::isPermission('reports.accept'));

            // On the Roles screen it is beside the four, under the name its button has.
            $catalog = $this->getJson('/api/_nevela/permissions')->assertOk()->json();
            $features = collect($catalog['modules'])->flatMap(fn ($module) => collect($module['groups'])->flatMap(fn ($group) => $group['features']))->keyBy('key');
            $this->assertSame(['create', 'view', 'edit', 'delete', 'accept', 'archive'], $features['applicants']['actions']);
            $this->assertSame(['accept' => 'Accept', 'archive' => 'Archive'], $features['applicants']['labels']);
            $this->assertArrayNotHasKey('labels', $features['products']);
        }

        public function test_an_administrator_has_it_and_an_editor_does_not_until_given_it(): void
        {
            $this->postJson("/api/applicants/{$this->amara->id}/_actions/accept")->assertOk();

            // An editor has everything to do with the records. Sending a letter is not that.
            $editor = $this->actingAsRole('EDITOR');
            $this->assertTrue($editor->can('applicants.edit'));
            $this->assertFalse($editor->can('applicants.accept'));
            $kofi = Applicant::create(['name' => 'Kofi', 'email' => 'kofi@example.com']);
            $this->postJson("/api/applicants/{$kofi->id}/_actions/accept")->assertForbidden();
            $this->postJson('/api/applicants/_actions/accept', ['ids' => [$kofi->id]])->assertForbidden();
            $this->postJson('/api/subscribers/_actions/announce', ['input' => ['subject' => 'Hi', 'message' => 'There']])->assertForbidden();
            $this->assertNull($kofi->refresh()->accepted_at);
            $this->assertSame(['amara@example.com'], self::$letters);

            // Given by name, on the Roles screen.
            $this->actingAsRole('ADMIN');
            $this->postJson('/api/_nevela/roles', ['name' => 'Admissions', 'grants' => ['applicants.view', 'applicants.accept']])->assertCreated();
            $this->postJson('/api/_nevela/roles', ['name' => 'Typo', 'grants' => ['applicants.acept']])->assertStatus(422);
            $this->actingAsRole('Admissions');
            $this->postJson("/api/applicants/{$kofi->id}/_actions/accept")->assertOk();
            // And it is all they were given.
            $this->patchJson("/api/applicants/{$kofi->id}", ['name' => 'Changed'])->assertForbidden();
            $this->postJson("/api/applicants/{$kofi->id}/_actions/archive")->assertForbidden();
        }

        public function test_a_role_with_every_permission_is_still_one_that_has_everything(): void
        {
            // "Everything" counts the actions too: a role that lists all but one is not an administrator's.
            $all = Permissions::keys();
            $this->assertTrue(Permissions::hasAll($all));
            $this->assertFalse(Permissions::hasAll(array_values(array_diff($all, ['applicants.accept']))));
            $this->assertFalse(Permissions::hasAll(['@access.*', '@resources.*']));
            $this->assertTrue(Permissions::hasAll(['*']));
            // Nobody hands out an action they don't hold.
            $this->assertSame(['applicants.accept'], Permissions::beyond(['@resources.*'], ['applicants.edit', 'applicants.accept']));
        }

        // --- on one record

        public function test_an_action_on_a_record_runs_its_class_and_answers_with_its_message(): void
        {
            $this->postJson("/api/applicants/{$this->amara->id}/_actions/accept")
                ->assertOk()
                ->assertJsonPath('message', 'Accepted Amara. Their letter is on its way.')
                ->assertJsonPath('record.id', $this->amara->id)
                ->assertJsonPath('record.name', 'Amara');
            $this->assertNotNull($this->amara->refresh()->accepted_at);
            $this->assertNotNull($this->getJson("/api/applicants/{$this->amara->id}")->json('acceptedAt'));
            $this->assertSame(['amara@example.com'], self::$letters);
        }

        public function test_a_record_it_no_longer_applies_to_refuses_it(): void
        {
            $this->postJson("/api/applicants/{$this->amara->id}/_actions/accept")->assertOk();

            // Accepted already: the button is gone from the page, and the address says the same.
            $this->postJson("/api/applicants/{$this->amara->id}/_actions/accept")
                ->assertStatus(409)->assertJsonPath('code', 'NOT_APPLICABLE')->assertJsonPath('error', "Accept can't be done to this applicant as it is now.");
            $this->assertCount(1, self::$letters);
        }

        public function test_an_action_that_throws_changes_nothing_and_says_it_did_not_work(): void
        {
            $unlucky = Applicant::create(['name' => 'Unlucky', 'email' => 'unlucky@example.com']);

            config(['app.debug' => false]);
            $response = $this->postJson("/api/applicants/{$unlucky->id}/_actions/accept")->assertStatus(500)->assertJsonPath('error', "Accept didn't work, and nothing was changed.");
            $this->assertArrayNotHasKey('detail', $response->json());
            // The class had set accepted_at before it failed. It is not set.
            $this->assertNull($unlucky->refresh()->accepted_at);
            $this->assertSame([], self::$letters);

            // Whoever is building the app is told why.
            config(['app.debug' => true]);
            $this->postJson("/api/applicants/{$unlucky->id}/_actions/accept")->assertStatus(500)->assertJsonPath('detail', 'The mail server is down.');
        }

        public function test_an_action_nobody_has_written_yet_says_where_to_write_it(): void
        {
            config(['app.debug' => true]);

            $this->postJson("/api/applicants/{$this->amara->id}/_actions/archive")
                ->assertStatus(500)
                ->assertJsonPath('error', "Archive didn't work, and nothing was changed.")
                ->assertJsonPath('detail', 'Archive does nothing yet. Write it in app/Nevela/Actions/Applicant/Archive.php.');
        }

        // --- on a selection

        public function test_a_record_action_runs_on_a_selection_and_passes_over_what_it_does_not_apply_to(): void
        {
            $kofi = Applicant::create(['name' => 'Kofi', 'email' => 'kofi@example.com']);
            $mei = Applicant::create(['name' => 'Mei', 'email' => 'mei@example.com', 'accepted_at' => now()]);

            $this->postJson('/api/applicants/_actions/accept', ['ids' => [$this->amara->id, $kofi->id, $mei->id, '00000000-0000-7000-8000-000000000000']])
                ->assertOk()
                ->assertJsonPath('done', 2)
                ->assertJsonPath('skipped', 2)
                ->assertJsonPath('message', 'Accept: 2 applicants, and 2 left as they were.');
            $this->assertEqualsCanonicalizing(['amara@example.com', 'kofi@example.com'], self::$letters);

            // One failure is all of them undone.
            self::$letters = [];
            $one = Applicant::create(['name' => 'One', 'email' => 'one@example.com']);
            $unlucky = Applicant::create(['name' => 'Unlucky', 'email' => 'unlucky@example.com']);
            $this->postJson('/api/applicants/_actions/accept', ['ids' => [$one->id, $unlucky->id]])->assertStatus(500);
            $this->assertNull($one->refresh()->accepted_at);

            $this->postJson('/api/applicants/_actions/accept', ['ids' => []])->assertStatus(422);
            $this->postJson('/api/applicants/_actions/accept')->assertStatus(422);
            // Archive is for one record at a time.
            $this->postJson('/api/applicants/_actions/archive', ['ids' => [$one->id]])->assertNotFound();
        }

        // --- on the resource as a whole, with something to fill in

        public function test_an_action_on_the_collection_checks_what_it_asks_for(): void
        {
            Subscriber::create(['email' => 'a@example.com']);
            Subscriber::create(['email' => 'b@example.com']);

            // A problem is reported against its field, as a form's is.
            $issues = $this->postJson('/api/subscribers/_actions/announce', ['input' => ['subject' => '', 'urgent' => 'perhaps', 'cc' => 'x@example.com']])
                ->assertStatus(422)->assertJsonPath('error', 'Validation failed.')->json('issues');
            $this->assertEqualsCanonicalizing(['subject', 'message', 'urgent', 'cc'], array_column($issues, 'path'));
            $this->postJson('/api/subscribers/_actions/announce')->assertStatus(422)->assertJsonPath('issues.0.path', 'subject');
            $this->assertSame([], self::$announcements);

            $this->postJson('/api/subscribers/_actions/announce', ['input' => ['subject' => 'Open day', 'message' => 'Saturday at ten.']])
                ->assertOk()->assertJsonPath('message', 'Queued for 2 subscribers.');
            $this->assertSame([['subject' => 'Open day', 'message' => 'Saturday at ten.']], self::$announcements);
        }

        public function test_addresses_that_name_no_action_are_not_found(): void
        {
            $this->postJson("/api/applicants/{$this->amara->id}/_actions/promote")->assertNotFound();
            $this->postJson('/api/applicants/_actions/promote')->assertNotFound();
            $this->postJson('/api/products/_actions/accept')->assertNotFound();
            $this->postJson('/api/nothing/_actions/accept')->assertNotFound();
            // An action on the collection has no record to be run on, and the other way round.
            $subscriber = Subscriber::create(['email' => 'a@example.com']);
            $this->postJson("/api/subscribers/{$subscriber->id}/_actions/announce", ['input' => ['subject' => 'x', 'message' => 'y']])->assertNotFound();
            $this->postJson('/api/applicants/00000000-0000-7000-8000-000000000000/_actions/accept')->assertNotFound();
            $this->getJson("/api/applicants/{$this->amara->id}/_actions/accept")->assertStatus(405);
        }
    }
}
