<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Media\Uploads;
use Nevela\Laravel\Models\Role;
use Nevela\Laravel\Models\Upload;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * A private file field, over HTTP: a CV that only someone who may view the candidate can
 * fetch, beside a public file on the same record for the difference.
 */
class PrivateFilesTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
        Uploads::forget();
        $this->resources(fn () => [Descriptor::fromSpec('Candidate', 'name:string, cv:file(pdf|private)?, photo:file(image|private)?, brochure:file(pdf)?')]);

        Access::reset();
        Permissions::forget();
        $this->actingAsRole('ADMIN');
    }

    private function actingAsRole(string $role): User
    {
        $user = User::factory()->create();
        $this->assertTrue(Access::grant($user, $role), "no role called {$role}");
        Sanctum::actingAs($user->refresh());

        return $user;
    }

    private function upload(string $field, string $name, string $type, string $bytes)
    {
        return $this->call('PUT', "/api/_nevela/uploads/Candidate/{$field}?name=".urlencode($name), [], [], [], [
            'CONTENT_TYPE' => $type,
            'CONTENT_LENGTH' => strlen($bytes),
            'HTTP_ACCEPT' => 'application/json',
        ], $bytes);
    }

    /** A candidate with a CV, as the dashboard makes one: upload, then save with the key. @return array<string, mixed> */
    private function candidate(string $name = 'Amara'): array
    {
        $key = $this->upload('cv', 'amara-cv.pdf', 'application/pdf', self::PDF)->assertCreated()->json('key');

        return $this->postJson('/api/candidates', ['name' => $name, 'cv' => $key])->assertCreated()->json();
    }

    public function test_it_is_a_file_field_marked_private(): void
    {
        $candidate = $this->descriptor('Candidate');
        $this->assertTrue($candidate->fields['cv']->private);
        $this->assertSame(['pdf'], $candidate->fields['cv']->accept);
        $this->assertFalse($candidate->fields['brochure']->private);
        $this->assertSame(['kind' => 'file', 'accept' => ['pdf'], 'private' => true, 'required' => false], $candidate->fields['cv']->toArray());

        // The dashboard is told, and a private picture is not a column: there is no thumbnail to put in one.
        $typescript = (string) file_get_contents(self::$dir.'/web/resources/candidate.resource.ts');
        $this->assertStringContainsString('cv: field.file(["pdf"], { required: false, list: true, ...({ private: true } as {}), ...({ column: "hidden" } as {}) }),', $typescript);
        $this->assertStringContainsString('photo: field.file(["image"], { required: false, list: true, ...({ private: true } as {}), ...({ column: "hidden" } as {}) }),', $typescript);
        $this->assertStringContainsString('brochure: field.file(["pdf"], { required: false, list: true, ...({ column: "hidden" } as {}) }),', $typescript);
    }

    public function test_it_is_stored_where_the_web_server_does_not_reach_and_its_key_opens_nothing(): void
    {
        $upload = $this->upload('cv', 'amara-cv.pdf', 'application/pdf', self::PDF)->assertCreated()
            ->assertJsonPath('private', true)->assertJsonPath('url', null)->assertJsonPath('name', 'amara-cv.pdf');
        $key = $upload->json('key');

        $this->assertStringStartsWith('private/candidates/cv/', $key);
        Storage::disk('local')->assertExists("nevela/{$key}");
        $this->assertSame([], Storage::disk('public')->allFiles());
        $this->assertSame('local', Upload::query()->where('key', $key)->value('disk'));

        // The public files route answers for it as for a file that was never there, signed in or not.
        $this->get("/api/_nevela/files/{$key}")->assertNotFound();
        $this->get('/api/_nevela/files/'.preg_replace('/\.pdf$/', '.thumb.pdf', $key))->assertNotFound();
        $this->get("/api/_nevela/files/nevela/{$key}")->assertNotFound();

        // A public file on the same record is as it always was.
        $brochure = $this->upload('brochure', 'brochure.pdf', 'application/pdf', self::PDF)->assertCreated()->json();
        $this->assertStringStartsWith('candidates/brochure/', $brochure['key']);
        $this->assertArrayNotHasKey('private', $brochure);
        Storage::disk('public')->assertExists($brochure['key']);
        $this->get("/api/_nevela/files/{$brochure['key']}")->assertOk();
    }

    public function test_someone_who_may_view_the_record_is_handed_the_file(): void
    {
        $candidate = $this->candidate();

        // The address names the record and the field. The key is not in it.
        $url = $candidate['cvFile']['url'];
        $this->assertStringEndsWith("/api/_nevela/private/candidates/{$candidate['id']}/cv", $url);
        $this->assertTrue($candidate['cvFile']['private']);
        $this->assertSame(strlen(self::PDF), $candidate['cvFile']['size']);

        $response = $this->get($url)->assertOk();
        $this->assertSame(self::PDF, $response->streamedContent());
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment; filename=amara-cv.pdf', (string) $response->headers->get('Content-Disposition'));
        // Never kept by anything on the way.
        $cache = (string) $response->headers->get('Cache-Control');
        $this->assertStringContainsString('private', $cache);
        $this->assertStringContainsString('no-store', $cache);
        $this->assertStringNotContainsString('public', $cache);
    }

    public function test_someone_who_may_not_view_the_record_is_not(): void
    {
        $url = $this->candidate()['cvFile']['url'];

        // Signed in, with a role that says nothing of candidates.
        $this->actingAsRole('USER');
        $this->getJson($url)->assertForbidden();

        // Given the view, and nothing more, it is enough.
        Role::query()->create(['name' => 'Recruiter', 'description' => null, 'grants' => ['candidates.view'], 'is_system' => false]);
        Access::reset();
        $this->actingAsRole('Recruiter');
        $this->get($url)->assertOk();
    }

    public function test_nobody_is_handed_it_without_signing_in(): void
    {
        $url = $this->candidate()['cvFile']['url'];
        $this->app['auth']->forgetGuards();

        $this->getJson($url)->assertUnauthorized();
    }

    public function test_addresses_that_name_no_private_file_are_not_found(): void
    {
        $candidate = $this->candidate();
        $id = $candidate['id'];
        $empty = $this->postJson('/api/candidates', ['name' => 'Kofi'])->assertCreated()->json('id');

        $this->get("/api/_nevela/private/candidates/{$empty}/cv")->assertNotFound();
        $this->get("/api/_nevela/private/candidates/{$id}/brochure")->assertNotFound();
        $this->get("/api/_nevela/private/candidates/{$id}/name")->assertNotFound();
        $this->get("/api/_nevela/private/candidates/{$id}/nothing")->assertNotFound();
        $this->get('/api/_nevela/private/candidates/00000000-0000-7000-8000-000000000000/cv')->assertNotFound();
        $this->get("/api/_nevela/private/products/{$id}/cv")->assertNotFound();
        $this->get("/api/_nevela/private/nothing/{$id}/cv")->assertNotFound();
    }

    public function test_a_key_is_only_good_for_the_field_it_was_uploaded_to(): void
    {
        $cv = $this->upload('cv', 'cv.pdf', 'application/pdf', self::PDF)->assertCreated()->json('key');

        // A private key can't be put in a public field, where its address would be asked for by key.
        $this->postJson('/api/candidates', ['name' => 'Amara', 'brochure' => $cv])->assertStatus(422)->assertJsonPath('issues.0.path', 'brochure');
        // Nor a key made up to look like one.
        $this->postJson('/api/candidates', ['name' => 'Amara', 'cv' => 'private/candidates/cv/2026/10/made-up.pdf'])->assertStatus(422)->assertJsonPath('issues.0.path', 'cv');
    }

    public function test_trashing_the_record_exposes_nothing_and_removing_it_for_good_removes_the_file(): void
    {
        $candidate = $this->candidate();
        $key = $candidate['cv'];
        $url = $candidate['cvFile']['url'];

        // In the trash: the record is found by nobody, so neither is its file. It is still on the disk.
        $this->deleteJson("/api/candidates/{$candidate['id']}")->assertNoContent();
        $this->get($url)->assertNotFound();
        $this->get("/api/_nevela/files/{$key}")->assertNotFound();
        Storage::disk('local')->assertExists("nevela/{$key}");

        // Restored, it is as it was.
        $this->postJson("/api/_nevela/trash/candidates/{$candidate['id']}/restore")->assertOk();
        $this->get($url)->assertOk();

        // Removed for good, the file goes with it, and the record of it.
        $this->deleteJson("/api/candidates/{$candidate['id']}")->assertNoContent();
        $this->deleteJson("/api/_nevela/trash/candidates/{$candidate['id']}")->assertNoContent();
        Storage::disk('local')->assertMissing("nevela/{$key}");
        $this->assertFalse(Upload::query()->where('key', $key)->exists());
    }

    public function test_a_file_two_records_share_stays_until_the_second_is_gone(): void
    {
        $first = $this->candidate('Amara');
        $second = $this->postJson('/api/candidates', ['name' => 'Copy', 'cv' => $first['cv']])->assertCreated()->json();

        foreach ([$first, $second] as $index => $candidate) {
            $this->deleteJson("/api/candidates/{$candidate['id']}")->assertNoContent();
            $this->deleteJson("/api/_nevela/trash/candidates/{$candidate['id']}")->assertNoContent();
            $index === 0
                ? Storage::disk('local')->assertExists("nevela/{$first['cv']}")
                : Storage::disk('local')->assertMissing("nevela/{$first['cv']}");
        }
    }

    public function test_where_there_is_no_trash_a_delete_removes_the_file_at_once(): void
    {
        Schema::dropColumns('candidates', ['deleted_at']);
        \App\Models\Candidate::forgetTrash();
        $candidate = $this->candidate();

        $this->deleteJson("/api/candidates/{$candidate['id']}")->assertNoContent();
        $this->assertFalse(DB::table('candidates')->where('id', $candidate['id'])->exists());
        Storage::disk('local')->assertMissing("nevela/{$candidate['cv']}");
    }

    public function test_a_private_picture_is_kept_as_it_came_with_nothing_made_from_it(): void
    {
        $image = imagecreatetruecolor(1200, 900);
        ob_start();
        imagejpeg($image, null, 90);
        $bytes = (string) ob_get_clean();

        $upload = $this->upload('photo', 'passport.jpg', 'image/jpeg', $bytes)->assertCreated()->assertJsonPath('private', true)->json();

        // No thumbnail, no WebP, no original set aside: each would be a copy somewhere else.
        $this->assertSame([], Storage::disk('public')->allFiles());
        $this->assertSame(["nevela/{$upload['key']}"], Storage::disk('local')->allFiles());
        $row = Upload::query()->where('key', $upload['key'])->firstOrFail();
        $this->assertFalse($row->optimised);
        $this->assertNull($row->renditions);
        $this->assertSame([1200, 900], [$row->width, $row->height]);

        $id = $this->postJson('/api/candidates', ['name' => 'Amara', 'photo' => $upload['key']])->assertCreated()->json('id');
        $this->assertSame($bytes, $this->get("/api/_nevela/private/candidates/{$id}/photo")->assertOk()->streamedContent());
    }
}
