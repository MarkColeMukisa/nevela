<?php

/*
 * The Story model as an app would have it once its author has said which stories are
 * public: the generated model, with publicQuery filled in. (The Memo model further down
 * is left as generated, to see what a scope nobody has filled in lets through.)
 */

namespace App\Models {
    use Illuminate\Database\Eloquent\Builder;
    use Illuminate\Database\Eloquent\Concerns\HasUuids;
    use Illuminate\Database\Eloquent\Model;
    use Nevela\Laravel\Concerns\Trashable;

    class Story extends Model
    {
        use HasUuids, Trashable;

        protected $table = 'stories';

        protected $fillable = ['title', 'slug', 'body', 'secret', 'featured', 'published_at'];

        protected function casts(): array
        {
            return ['featured' => 'boolean', 'published_at' => 'datetime'];
        }

        public function scopePublicQuery(Builder $query): void
        {
            $query->whereNotNull('published_at')->where('published_at', '<=', now());
        }
    }
}

namespace Tests\Feature {
    use App\Models\Memo;
    use App\Models\Story;
    use App\Models\User;
    use Closure;
    use Illuminate\Foundation\Testing\RefreshDatabase;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Facades\Storage;
    use Laravel\Sanctum\Sanctum;
    use Nevela\Laravel\Access\Access;
    use Nevela\Laravel\Media\Uploads;
    use Nevela\Laravel\Models\Upload;
    use Nevela\Laravel\Support\Descriptor;
    use Tests\GeneratesResources;
    use Tests\TestCase;

    /** A spam check of the app's own: a field no person fills in. */
    class Honeypot
    {
        public function handle(Request $request, Closure $next)
        {
            return $request->filled('website') ? response()->json(['error' => 'No.'], 422) : $next($request);
        }
    }

    /**
     * A resource's "public" section, over HTTP, with nobody signed in: stories anyone can
     * read once they are published, an enquiry form with a CV, and a newsletter sign-up.
     */
    class PublicTest extends TestCase
    {
        use GeneratesResources, RefreshDatabase;

        private const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";

        protected function setUp(): void
        {
            parent::setUp();
            Storage::fake('public');
            Storage::fake('local');
            Uploads::forget();
            Access::reset();
            $this->app['router']->aliasMiddleware('honeypot', Honeypot::class);
            $this->resources(fn () => [
                Descriptor::fromArray([
                    'name' => 'Story',
                    'fields' => [
                        'title' => ['kind' => 'string'], 'slug' => ['kind' => 'string', 'format' => 'slug', 'unique' => true], 'body' => ['kind' => 'text', 'format' => 'rich'],
                        'secret' => ['kind' => 'string', 'required' => false], 'featured' => ['kind' => 'boolean'], 'publishedAt' => ['kind' => 'datetime', 'required' => false],
                    ],
                    'public' => ['read' => ['by' => 'slug', 'fields' => ['title', 'slug', 'body', 'publishedAt']]],
                ]),
                Descriptor::fromArray(['name' => 'Memo', 'fields' => ['title' => ['kind' => 'string']], 'public' => ['read' => ['fields' => ['title']]]]),
                Descriptor::fromArray([
                    'name' => 'Enquiry',
                    'fields' => [
                        'name' => ['kind' => 'string'], 'email' => ['kind' => 'string', 'format' => 'email'], 'subject' => ['kind' => 'string'],
                        'category' => ['kind' => 'enum', 'options' => ['consulting', 'training', 'other'], 'default' => 'other'],
                        'message' => ['kind' => 'text'], 'status' => ['kind' => 'enum', 'options' => ['new', 'read'], 'default' => 'new'],
                        'cv' => ['kind' => 'file', 'accept' => ['pdf'], 'private' => true, 'required' => false],
                        'brochure' => ['kind' => 'file', 'accept' => ['pdf'], 'required' => false], 'internal' => ['kind' => 'string', 'required' => false],
                    ],
                    'public' => ['create' => ['fields' => ['name', 'email', 'subject', 'category', 'message', 'cv'], 'throttle' => '5,1']],
                ]),
                Descriptor::fromArray([
                    'name' => 'Signup',
                    'fields' => ['email' => ['kind' => 'string', 'format' => 'email', 'unique' => true], 'source' => ['kind' => 'string', 'default' => 'website']],
                    'public' => ['read' => ['fields' => ['email']], 'create' => ['fields' => ['email']], 'middleware' => ['honeypot']],
                ]),
            ]);
        }

        private function signIn(): void
        {
            $user = User::factory()->create();
            Access::grant($user, 'ADMIN');
            Sanctum::actingAs($user);
        }

        /** @param array<string, mixed> $over */
        private function story(string $slug, array $over = []): Story
        {
            return Story::create($over + ['title' => ucfirst(str_replace('-', ' ', $slug)), 'slug' => $slug, 'body' => "<p>About {$slug}.</p>", 'secret' => 'internal note', 'featured' => false, 'published_at' => now()->subDay()]);
        }

        /** @return array<string, mixed> */
        private function enquiry(array $over = []): array
        {
            return $over + ['name' => 'Amara', 'email' => 'amara@example.com', 'subject' => 'Training', 'message' => 'When is the next intake?'];
        }

        private function upload(string $resource, string $field, string $bytes = self::PDF)
        {
            return $this->call('PUT', "/api/public/_nevela/uploads/{$resource}/{$field}?name=cv.pdf", [], [], [], ['CONTENT_TYPE' => 'application/pdf', 'CONTENT_LENGTH' => strlen($bytes), 'HTTP_ACCEPT' => 'application/json'], $bytes);
        }

        // --- nothing is open that the descriptor doesn't open

        public function test_a_resource_without_the_section_has_nothing_public(): void
        {
            $this->getJson('/api/public/products')->assertNotFound();
            $this->getJson('/api/public/products/anything')->assertNotFound();
            $this->postJson('/api/public/products', ['name' => 'Kettle'])->assertNotFound();
            $this->call('PUT', '/api/public/_nevela/uploads/Product/image', [], [], [], ['HTTP_ACCEPT' => 'application/json'], 'x')->assertNotFound();
            $this->getJson('/api/public/nothing')->assertNotFound();
            // And the signed-in API is still for the signed in.
            $this->getJson('/api/stories')->assertUnauthorized();
        }

        public function test_only_what_the_section_names_exists(): void
        {
            // Stories can be read and not written; enquiries written and not read.
            $this->postJson('/api/public/stories', ['title' => 'Mine'])->assertStatus(405);
            $this->getJson('/api/public/enquiries')->assertStatus(405);
            $this->getJson('/api/public/enquiries/anything')->assertNotFound();
            $this->patchJson('/api/public/stories/x', ['title' => 'Changed'])->assertStatus(405);
            $this->deleteJson('/api/public/stories/x')->assertStatus(405);

            $public = collect(glob(self::$dir.'/loaded/*.php'))->map(fn ($file) => (string) file_get_contents($file))->first(fn ($php) => str_contains($php, 'PublicController'));
            $this->assertStringContainsString("Route::post('enquiries', [\\Nevela\\Laravel\\Http\\PublicController::class, 'store'])->defaults('resource', 'Enquiry')->middleware(['nevela.throttle:5,1,enquiries.create:'])", $public);
            $this->assertStringContainsString("Route::put('_nevela/uploads/Enquiry/cv'", $public);
            $this->assertStringNotContainsString('uploads/Enquiry/brochure', $public);
            $this->assertStringContainsString("->middleware(['nevela.throttle:10,1,signups.create:', 'honeypot'])", $public);
        }

        // --- reading

        public function test_a_model_that_has_not_said_which_records_are_public_shows_none(): void
        {
            Memo::create(['title' => 'Not for everyone']);
            $id = Memo::query()->value('id');

            // The scope is there, written with the model, and lets nothing through as generated.
            $this->assertStringContainsString("public function scopePublicQuery(\\Illuminate\\Database\\Eloquent\\Builder \$query): void\n    {\n        \$query->whereRaw('1 = 0');", (string) file_get_contents(self::$dir.'/api/app/Models/Memo.php'));
            $this->getJson('/api/public/memos')->assertOk()->assertJsonPath('meta.total', 0)->assertJsonPath('data', []);
            $this->getJson("/api/public/memos/{$id}")->assertNotFound();
        }

        public function test_published_records_are_listed_and_shown_with_only_the_fields_the_section_lists(): void
        {
            $first = $this->story('opening-day', ['published_at' => now()->subDays(2)]);
            $this->story('summer-intake');

            $list = $this->getJson('/api/public/stories')->assertOk()->assertJsonPath('meta.total', 2)->json('data');
            // Newest first, and nothing in a record but its id and what was listed.
            $this->assertSame(['summer-intake', 'opening-day'], array_column($list, 'slug'));
            $this->assertSame(['id', 'title', 'slug', 'body', 'publishedAt'], array_keys($list[0]));

            // One, by the field the section names.
            $one = $this->getJson('/api/public/stories/opening-day')->assertOk()->assertJsonPath('id', $first->id)->assertJsonPath('body', '<p>About opening-day.</p>')->json();
            $this->assertSame(['id', 'title', 'slug', 'body', 'publishedAt'], array_keys($one));
            // Its id is not its address here.
            $this->getJson("/api/public/stories/{$first->id}")->assertNotFound();
        }

        public function test_a_record_the_model_does_not_let_through_is_not_there(): void
        {
            $this->story('published');
            $draft = $this->story('draft', ['published_at' => null]);
            $later = $this->story('next-week', ['published_at' => now()->addWeek()]);

            $this->getJson('/api/public/stories')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.slug', 'published');
            foreach ([$draft, $later] as $hidden) {
                $this->getJson("/api/public/stories/{$hidden->slug}")->assertNotFound();
                $this->getJson("/api/public/stories/{$hidden->id}")->assertNotFound();
            }
            $this->getJson('/api/public/stories?q=draft')->assertOk()->assertJsonPath('meta.total', 0);
        }

        public function test_a_record_in_the_trash_is_never_public(): void
        {
            $story = $this->story('gone');
            $this->getJson('/api/public/stories/gone')->assertOk();

            $story->delete();
            $this->getJson('/api/public/stories/gone')->assertNotFound();
            $this->getJson('/api/public/stories')->assertOk()->assertJsonPath('meta.total', 0);
        }

        public function test_a_field_that_is_not_listed_can_not_be_reached_by_sorting_filtering_or_searching(): void
        {
            $this->story('one', ['secret' => 'alpha', 'featured' => true]);
            $this->story('two', ['secret' => 'beta']);

            // The signed-in list would sort, filter and search by these. The public one doesn't know them.
            $this->getJson('/api/public/stories?sort=secret')->assertStatus(400)->assertJsonPath('issues.0.param', 'sort');
            $this->getJson('/api/public/stories?filter[secret]=alpha')->assertStatus(400)->assertJsonPath('issues.0.param', 'filter[secret]');
            $this->getJson('/api/public/stories?filter[featured]=true')->assertStatus(400);
            $this->getJson('/api/public/stories?q=alpha')->assertOk()->assertJsonPath('meta.total', 0);
            foreach (['/api/public/stories', '/api/public/stories/one'] as $address) {
                $this->assertStringNotContainsString('alpha', (string) $this->getJson($address)->assertOk()->getContent());
                $this->assertStringNotContainsString('featured', (string) $this->getJson($address)->getContent());
                $this->assertStringNotContainsString('createdAt', (string) $this->getJson($address)->getContent());
            }

            // What is listed works as on any list.
            $this->getJson('/api/public/stories?q=two')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.slug', 'two');
            $this->getJson('/api/public/stories?sort=title&perPage=1&page=2')->assertOk()->assertJsonPath('data.0.slug', 'two')->assertJsonPath('meta.totalPages', 2);
            $this->getJson('/api/public/stories?filter[slug]=one')->assertOk()->assertJsonPath('meta.total', 1);
        }

        // --- creating

        public function test_a_visitor_creates_a_record_from_the_listed_fields_and_the_rest_take_their_defaults(): void
        {
            // Nothing may be read of enquiries, so nothing is sent back.
            $response = $this->postJson('/api/public/enquiries', $this->enquiry())->assertStatus(201);
            $this->assertSame('', $response->getContent());

            $row = DB::table('enquiries')->first();
            $this->assertSame(['Amara', 'amara@example.com', 'Training'], [$row->name, $row->email, $row->subject]);
            // Left out of the form: the usual. And one a visitor may not send at all.
            $this->assertSame('other', $row->category);
            $this->assertSame('new', $row->status);
            $this->assertNull($row->internal);

            $this->postJson('/api/public/enquiries', $this->enquiry(['category' => 'training']))->assertStatus(201);
            $this->assertSame(1, DB::table('enquiries')->where('category', 'training')->count());
        }

        public function test_what_a_visitor_may_not_send_is_refused_and_what_they_send_is_checked(): void
        {
            // A field of the resource that isn't in the list is as unknown as one that doesn't exist.
            $this->postJson('/api/public/enquiries', $this->enquiry(['status' => 'read']))->assertStatus(422)->assertJsonPath('issues.0.path', 'status')->assertJsonPath('issues.0.message', 'Unknown field.');
            $this->postJson('/api/public/enquiries', $this->enquiry(['internal' => 'x', 'id' => '1']))->assertStatus(422);
            $this->postJson('/api/public/enquiries', $this->enquiry(['nonsense' => 'x']))->assertStatus(422)->assertJsonPath('issues.0.path', 'nonsense');

            // The rules are the signed-in form's.
            $issues = $this->postJson('/api/public/enquiries', ['email' => 'not an address', 'category' => 'gossip'])->assertStatus(422)->assertJsonPath('error', 'Validation failed.')->json('issues');
            $this->assertEqualsCanonicalizing(['name', 'email', 'subject', 'category', 'message'], array_values(array_unique(array_column($issues, 'path'))));
            $this->assertSame(0, DB::table('enquiries')->count());
        }

        public function test_what_was_made_is_sent_back_as_far_as_it_may_be_read(): void
        {
            $created = $this->postJson('/api/public/signups', ['email' => 'kofi@example.com'])->assertStatus(201)->json();

            $this->assertSame(['id', 'email'], array_keys($created));
            $this->assertSame('website', DB::table('signups')->value('source'));
            // Twice is once too many, said on the field.
            $this->postJson('/api/public/signups', ['email' => 'kofi@example.com'])->assertStatus(422)->assertJsonPath('issues.0.path', 'email');
        }

        public function test_the_apps_own_middleware_runs_first(): void
        {
            $this->postJson('/api/public/signups', ['email' => 'bot@example.com', 'website' => 'https://spam.test'])->assertStatus(422)->assertJsonPath('error', 'No.');
            $this->assertSame(0, DB::table('signups')->count());
        }

        public function test_too_many_requests_are_told_so_in_the_usual_shape(): void
        {
            for ($i = 1; $i <= 5; $i++) {
                $this->postJson('/api/public/enquiries', $this->enquiry())->assertStatus(201);
            }

            $this->postJson('/api/public/enquiries', $this->enquiry())->assertStatus(429)->assertJsonPath('error', 'Too many requests. Try again shortly.')->assertHeader('Retry-After');
            $this->assertSame(5, DB::table('enquiries')->count());

            // Each thing has its own count: a form that is used up doesn't stop its upload, or another form, or the reading of pages.
            $this->upload('Enquiry', 'cv')->assertCreated();
            $this->postJson('/api/public/signups', ['email' => 'still@example.com'])->assertStatus(201);
            $this->getJson('/api/public/stories')->assertOk();
        }

        public function test_through_the_web_app_each_visitor_has_their_own_count_and_the_site_itself_has_none(): void
        {
            config(['nevela.auth.proxy_secret' => 'shared-secret']);
            $from = fn (?string $visitor, string $secret = 'shared-secret') => array_filter(['X-Nevela-Proxy-Secret' => $secret, 'X-Nevela-Ip' => $visitor]);

            // Every one of these arrives from the web app's server. They are counted by whose they are.
            for ($i = 1; $i <= 5; $i++) {
                $this->postJson('/api/public/enquiries', $this->enquiry(), $from('203.0.113.7'))->assertStatus(201);
            }
            $this->postJson('/api/public/enquiries', $this->enquiry(), $from('203.0.113.7'))->assertStatus(429);
            $this->postJson('/api/public/enquiries', $this->enquiry(), $from('198.51.100.9'))->assertStatus(201);

            // The site reading its own stories, to build a page it will show to many: not counted at all.
            $this->story('busy');
            for ($i = 1; $i <= 70; $i++) {
                $this->getJson('/api/public/stories', $from(null))->assertOk();
            }

            // Saying so without the secret is believed by nobody: it is one more caller, counted from where it came.
            for ($i = 1; $i <= 60; $i++) {
                $this->getJson('/api/public/stories', $from('192.0.2.'.$i, 'guessed'))->assertOk();
            }
            $this->getJson('/api/public/stories', $from('192.0.2.200', 'guessed'))->assertStatus(429);
        }

        // --- a file with it

        public function test_a_visitor_uploads_a_private_file_and_can_not_read_it_back(): void
        {
            $upload = $this->upload('Enquiry', 'cv')->assertCreated()->assertJsonPath('private', true)->assertJsonPath('url', null)->json();
            $key = $upload['key'];
            Storage::disk('local')->assertExists("nevela/{$key}");

            $this->postJson('/api/public/enquiries', $this->enquiry(['cv' => $key]))->assertStatus(201);
            $id = DB::table('enquiries')->value('id');
            $this->assertSame($key, DB::table('enquiries')->value('cv'));

            // Not by its key, not through the record without signing in, and there is no public way to it.
            $this->get("/api/_nevela/files/{$key}")->assertNotFound();
            $this->getJson("/api/_nevela/private/enquiries/{$id}/cv")->assertUnauthorized();
            $this->getJson("/api/public/enquiries/{$id}")->assertNotFound();

            // Whoever may view enquiries is handed it.
            $this->signIn();
            $this->assertSame(self::PDF, $this->get("/api/_nevela/private/enquiries/{$id}/cv")->assertOk()->streamedContent());
        }

        public function test_an_upload_is_only_for_a_file_field_the_form_has_and_keeps_that_fields_limits(): void
        {
            // A file field of the resource that the form doesn't list has no way in.
            $this->upload('Enquiry', 'brochure')->assertNotFound();
            $this->upload('Enquiry', 'name')->assertNotFound();
            $this->upload('Story', 'body')->assertNotFound();
            // The field takes PDFs.
            $this->upload('Enquiry', 'cv', "GIF89a\x01\x00\x01\x00\x00\x00\x00;")->assertStatus(422);
            config(['nevela.uploads.max_bytes' => 10]);
            $this->upload('Enquiry', 'cv')->assertStatus(413);
            $this->assertSame(0, Upload::query()->count());
        }

        public function test_a_key_is_good_once_and_for_an_hour(): void
        {
            $key = $this->upload('Enquiry', 'cv')->assertCreated()->json('key');
            $this->postJson('/api/public/enquiries', $this->enquiry(['cv' => $key]))->assertStatus(201);

            // Used: a second enquiry can't be given the first one's CV.
            $this->postJson('/api/public/enquiries', $this->enquiry(['cv' => $key]))->assertStatus(422)->assertJsonPath('issues.0.path', 'cv');

            // Too late: uploaded over an hour ago.
            $old = $this->upload('Enquiry', 'cv')->assertCreated()->json('key');
            Upload::query()->where('key', $old)->update(['created_at' => now()->subMinutes(61)]);
            $this->postJson('/api/public/enquiries', $this->enquiry(['cv' => $old]))->assertStatus(422)->assertJsonPath('issues.0.path', 'cv');

            // One a signed-in person uploaded is not a visitor's to use, nor one made up.
            $this->signIn();
            $staff = $this->call('PUT', '/api/_nevela/uploads/Enquiry/cv?name=cv.pdf', [], [], [], ['CONTENT_TYPE' => 'application/pdf', 'CONTENT_LENGTH' => strlen(self::PDF), 'HTTP_ACCEPT' => 'application/json'], self::PDF)->assertCreated()->json('key');
            $this->app['auth']->forgetGuards();
            $this->postJson('/api/public/enquiries', $this->enquiry(['cv' => $staff]))->assertStatus(422);
            $this->postJson('/api/public/enquiries', $this->enquiry(['cv' => 'private/enquiries/cv/2026/10/made-up.pdf']))->assertStatus(422);
            $this->assertSame(1, DB::table('enquiries')->count());
        }

        public function test_an_upload_nobody_used_is_gone_after_the_nightly_run(): void
        {
            $used = $this->upload('Enquiry', 'cv')->assertCreated()->json('key');
            $this->postJson('/api/public/enquiries', $this->enquiry(['cv' => $used]))->assertStatus(201);
            $fresh = $this->upload('Enquiry', 'cv')->assertCreated()->json('key');
            $left = $this->upload('Enquiry', 'cv')->assertCreated()->json('key');
            Upload::query()->whereIn('key', [$used, $left])->update(['created_at' => now()->subHours(2)]);

            $this->artisan('nevela:trash')->expectsOutputToContain('Removed 1 file(s) uploaded through a public form and never used.')->assertSuccessful();

            // The form that was started and left: gone. The one still being filled in, and the one that was sent, stay.
            Storage::disk('local')->assertMissing("nevela/{$left}");
            $this->assertFalse(Upload::query()->where('key', $left)->exists());
            Storage::disk('local')->assertExists("nevela/{$fresh}");
            Storage::disk('local')->assertExists("nevela/{$used}");
            $this->assertSame(Uploads::CLAIMED, Upload::query()->where('key', $used)->value('uploaded_by'));
        }
    }
}
