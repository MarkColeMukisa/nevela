<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * A rich text field, over HTTP: whatever is sent, by whichever way in, what is stored
 * and what is read back is HTML with only what the editor's toolbar can make.
 */
class RichTextTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private const DIRTY = '<p onclick="x()">Hi<script>alert(1)</script></p>';

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn () => [Descriptor::fromSpec('Article', 'title:string, body:richtext(200), summary:richtext?')]);

        Access::reset();
        Permissions::forget();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
    }

    private function stored(string $id, string $column = 'body'): ?string
    {
        return DB::table('articles')->where('id', $id)->value($column);
    }

    public function test_what_is_sent_is_cleaned_before_it_is_stored(): void
    {
        // The form and the API are the same request.
        $id = $this->postJson('/api/articles', ['title' => 'One', 'body' => self::DIRTY])->assertCreated()->assertJsonPath('body', '<p>Hi</p>')->json('id');
        $this->assertSame('<p>Hi</p>', $this->stored($id));

        $this->patchJson("/api/articles/{$id}", ['body' => '<h2 style="color:red">New</h2><p><a href="javascript:alert(1)">x</a> <b>y</b></p>'])->assertOk()->assertJsonPath('body', '<h2>New</h2><p>x <strong>y</strong></p>');
        $this->assertSame('<h2>New</h2><p>x <strong>y</strong></p>', $this->stored($id));

        $this->putJson("/api/articles/{$id}", ['title' => 'One', 'body' => self::DIRTY, 'summary' => 'Plain words'])->assertOk()->assertJsonPath('summary', '<p>Plain words</p>');
        $this->assertSame('<p>Hi</p>', $this->stored($id));
        $this->assertSame('<p>Plain words</p>', $this->stored($id, 'summary'));
    }

    public function test_several_at_once_and_a_csv_import_are_cleaned_the_same_way(): void
    {
        // "Add several" and the import dialog both send rows to _bulk.
        $created = $this->postJson('/api/articles/_bulk', ['items' => [
            ['title' => 'One', 'body' => self::DIRTY],
            ['title' => 'Two', 'body' => 'From a spreadsheet <img src=x onerror=alert(1)>', 'summary' => '<ul><li>kept</li></ul>'],
        ]])->assertCreated()->json('data');

        $this->assertSame(['<p>Hi</p>', '<p>From a spreadsheet</p>'], array_column($created, 'body'));
        $this->assertSame('<p>Hi</p>', $this->stored($created[0]['id']));
        $this->assertSame('<ul><li>kept</li></ul>', $this->stored($created[1]['id'], 'summary'));
    }

    public function test_the_length_is_that_of_what_is_kept(): void
    {
        // Long as it was sent, short once the attributes are gone: 200 is the limit.
        $padded = '<p class="'.str_repeat('x', 400).'">'.str_repeat('a', 190).'</p>';
        $this->postJson('/api/articles', ['title' => 'One', 'body' => $padded])->assertCreated();

        // 201 characters of stored HTML: the tags count.
        $this->postJson('/api/articles', ['title' => 'Two', 'body' => '<p>'.str_repeat('a', 194).'</p>'])->assertStatus(422)->assertJsonPath('issues.0.path', 'body');
        $this->postJson('/api/articles/_bulk', ['items' => [['title' => 'Two', 'body' => '<p>'.str_repeat('a', 194).'</p>']]])->assertStatus(422)->assertJsonPath('rows.0.issues.0.path', 'body');
        $this->assertSame(1, DB::table('articles')->count());
    }

    public function test_an_editor_opened_and_left_is_nothing(): void
    {
        // Required, and there is nothing in it to read.
        $this->postJson('/api/articles', ['title' => 'One', 'body' => '<p><br></p>'])->assertStatus(422)->assertJsonPath('issues.0.path', 'body');
        $this->postJson('/api/articles', ['title' => 'One', 'body' => '<script>alert(1)</script>'])->assertStatus(422)->assertJsonPath('issues.0.path', 'body');
        // Optional: stored as empty, not as an empty paragraph.
        $id = $this->postJson('/api/articles', ['title' => 'One', 'body' => '<p>x</p>', 'summary' => '<p> </p>'])->assertCreated()->assertJsonPath('summary', null)->json('id');
        $this->assertNull($this->stored($id, 'summary'));
    }

    public function test_html_that_reached_the_table_some_other_way_is_cleaned_when_it_is_read(): void
    {
        $id = (string) Str::uuid7();
        DB::table('articles')->insert(['id' => $id, 'title' => 'Old', 'body' => '<div onmouseover="x()"><p>Kept</p><iframe src="https://evil.test"></iframe></div>', 'created_at' => now(), 'updated_at' => now()]);

        $this->getJson("/api/articles/{$id}")->assertOk()->assertJsonPath('body', '<p>Kept</p>');
        $this->getJson('/api/articles')->assertOk()->assertJsonPath('data.0.body', '<p>Kept</p>');
    }

    public function test_the_app_decides_what_is_allowed(): void
    {
        config(['nevela.rich_text.tags' => ['p', 'u'], 'nevela.rich_text.attributes' => []]);

        $this->postJson('/api/articles', ['title' => 'One', 'body' => '<p><u>under</u> <strong>bold</strong> <a href="https://a.test">link</a></p>'])
            ->assertCreated()->assertJsonPath('body', '<p><u>under</u> bold link</p>');
    }

    public function test_it_is_seeded_with_something_to_read(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Article', '--count' => 5])->assertSuccessful();

        $body = $this->getJson('/api/articles')->assertOk()->assertJsonPath('meta.total', 5)->json('data.0.body');
        $this->assertStringContainsString('<h2>', $body);
        $this->assertStringContainsString('<ul><li>', $body);
    }
}
