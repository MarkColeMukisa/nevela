<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Models\Role;
use Nevela\Laravel\Support\Descriptor;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * What a blog is made of, over HTTP: a slug that fills itself from the title, a date a
 * post is published by, and a public side that shows the published ones and no others.
 *
 * The resource is the one `nevela blog` makes, under another name, with its model as
 * generated: its publicQuery is the one written for a resource with a publish date.
 */
class BlogTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resources(fn () => [Descriptor::fromArray([
            'name' => 'Entry',
            'publish' => 'publishedAt',
            'blog' => '/blog',
            'fields' => [
                'title' => ['kind' => 'string'],
                'slug' => ['kind' => 'string', 'format' => 'slug', 'unique' => true, 'from' => 'title'],
                'excerpt' => ['kind' => 'string', 'maxLength' => 500, 'required' => false],
                'body' => ['kind' => 'text', 'format' => 'rich'],
                'publishedAt' => ['kind' => 'datetime', 'required' => false],
            ],
            'public' => ['read' => ['by' => 'slug', 'fields' => ['title', 'slug', 'excerpt', 'body', 'publishedAt']]],
        ])]);

        Access::reset();
        Permissions::forget();
        $this->actingAsRole('ADMIN');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function actingAsRole(string $role): User
    {
        $user = User::factory()->create();
        $this->assertTrue(Access::grant($user, $role), "no role called {$role}");
        Sanctum::actingAs($user->refresh());

        return $user;
    }

    /** @param array<string, mixed> $over */
    private function entry(string $title, array $over = []): array
    {
        return $this->postJson('/api/entries', $over + ['title' => $title, 'body' => "<p>About {$title}.</p>"])->assertCreated()->json();
    }

    // --- a slug that fills itself

    public function test_a_slug_left_empty_is_made_from_the_title(): void
    {
        $this->assertSame('opening-day', $this->entry('Opening Day')['slug']);
        // The next one of that name gets an address of its own, and so does the one after.
        $this->assertSame('opening-day-2', $this->entry('Opening day')['slug']);
        $this->assertSame('opening-day-3', $this->entry('Opening   Day!')['slug']);
        // Sent empty is the same as left out.
        $this->assertSame('summer-intake', $this->entry('Summer intake', ['slug' => ''])['slug']);
        $this->assertSame('summer-intake-2', $this->entry('Summer intake', ['slug' => null])['slug']);
        // A title with nothing an address can keep still gets one.
        $this->assertSame('untitled', $this->entry('!!!')['slug']);
        // One that is typed is kept as typed, and is still checked.
        $this->assertSame('my-own', $this->entry('Anything', ['slug' => 'my-own'])['slug']);
        $this->postJson('/api/entries', ['title' => 'Other', 'body' => '<p>x</p>', 'slug' => 'my-own'])->assertStatus(422)->assertJsonPath('issues.0.path', 'slug');
        $this->postJson('/api/entries', ['title' => 'Other', 'body' => '<p>x</p>', 'slug' => 'not a slug'])->assertStatus(422)->assertJsonPath('issues.0.path', 'slug');
    }

    public function test_a_slug_in_the_trash_is_still_taken(): void
    {
        $first = $this->entry('Opening day');
        $this->deleteJson("/api/entries/{$first['id']}")->assertNoContent();

        // The deleted post can be restored with its address, so the new one gets another.
        $this->assertSame('opening-day-2', $this->entry('Opening day')['slug']);
        $this->postJson("/api/_nevela/trash/entries/{$first['id']}/restore")->assertOk();
        $this->getJson("/api/entries/{$first['id']}")->assertOk()->assertJsonPath('slug', 'opening-day');
    }

    public function test_an_address_does_not_move_when_the_title_changes(): void
    {
        $entry = $this->entry('Opening day');

        $this->patchJson("/api/entries/{$entry['id']}", ['title' => 'Grand opening'])->assertOk()->assertJsonPath('slug', 'opening-day');
        // Nor when an edit sends the slug empty, or a replace leaves it out.
        $this->patchJson("/api/entries/{$entry['id']}", ['slug' => ''])->assertOk()->assertJsonPath('slug', 'opening-day');
        $this->putJson("/api/entries/{$entry['id']}", ['title' => 'Grand opening', 'body' => '<p>New.</p>'])->assertOk()->assertJsonPath('slug', 'opening-day')->assertJsonPath('title', 'Grand opening');
        // Changing it is a decision someone makes by typing a new one.
        $this->patchJson("/api/entries/{$entry['id']}", ['slug' => 'grand-opening'])->assertOk()->assertJsonPath('slug', 'grand-opening');
    }

    public function test_several_created_at_once_each_get_their_own(): void
    {
        $this->entry('Notes');

        $created = $this->postJson('/api/entries/_bulk', ['items' => [
            ['title' => 'Notes', 'body' => '<p>a</p>'],
            ['title' => 'Notes', 'body' => '<p>b</p>'],
            ['title' => 'Other', 'body' => '<p>c</p>', 'slug' => 'notes-4'],
            ['title' => 'Notes', 'body' => '<p>d</p>'],
        ]])->assertCreated()->json('data');

        // Past the one in the table, past each other, and past one a later row asks for by name.
        $this->assertSame(['notes-2', 'notes-3', 'notes-4', 'notes-5'], array_column($created, 'slug'));
    }

    // --- publishing

    public function test_a_post_is_a_draft_until_it_is_published_and_the_list_can_be_filtered_by_which_it_is(): void
    {
        Carbon::setTestNow('2026-10-12 12:00:00');
        $draft = $this->entry('Draft');
        $live = $this->entry('Live', ['publishedAt' => '2026-10-10T09:00:00Z']);
        $later = $this->entry('Later', ['publishedAt' => '2026-10-20T09:00:00Z']);

        $titles = fn (string $state) => array_column($this->getJson("/api/entries?filter[publishedAt]={$state}")->assertOk()->json('data'), 'title');
        $this->assertSame(['Draft'], $titles('draft'));
        $this->assertSame(['Live'], $titles('published'));
        $this->assertSame(['Later'], $titles('scheduled'));
        $this->getJson('/api/entries?filter[publishedAt]=soon')->assertStatus(400)->assertJsonPath('issues.0.param', 'filter[publishedAt]');
        // The counts above the table follow the filter, as for any other.
        $this->getJson('/api/entries/_insights?filter[publishedAt]=draft')->assertOk()->assertJsonPath('total', 1);

        // Publish is the date set to now; unpublish is the date cleared.
        $this->patchJson("/api/entries/{$draft['id']}", ['publishedAt' => now()->toJSON()])->assertOk();
        $this->assertEqualsCanonicalizing(['Draft', 'Live'], $titles('published'));
        $this->patchJson("/api/entries/{$live['id']}", ['publishedAt' => null])->assertOk()->assertJsonPath('publishedAt', null);
        $this->assertSame(['Live'], $titles('draft'));
        $this->assertSame(['Later'], $titles('scheduled'));
        $this->assertNotNull($later['publishedAt']);
    }

    public function test_publishing_takes_the_permission_to_edit(): void
    {
        $entry = $this->entry('Draft');
        Role::query()->create(['name' => 'Reader', 'description' => null, 'grants' => ['entries.view'], 'is_system' => false]);
        Access::reset();
        $this->actingAsRole('Reader');

        $this->getJson("/api/entries/{$entry['id']}")->assertOk();
        $this->patchJson("/api/entries/{$entry['id']}", ['publishedAt' => now()->toJSON()])->assertForbidden();
        $this->assertNull(DB::table('entries')->where('id', $entry['id'])->value('published_at'));
    }

    // --- what the site sees

    public function test_only_published_posts_are_public_and_a_scheduled_one_appears_when_its_time_comes(): void
    {
        Carbon::setTestNow('2026-10-12 12:00:00');
        $this->entry('Draft');
        $this->entry('Live', ['publishedAt' => '2026-10-10T09:00:00Z', 'excerpt' => 'It is open.']);
        $this->entry('Tomorrow', ['publishedAt' => '2026-10-13T09:00:00Z']);
        $this->app['auth']->forgetGuards();

        // The list the blog's page, its sitemap and its feed are all made from.
        $list = $this->getJson('/api/public/entries?sort=-publishedAt')->assertOk()->assertJsonPath('meta.total', 1)->json('data');
        $this->assertSame(['id', 'title', 'slug', 'excerpt', 'body', 'publishedAt'], array_keys($list[0]));
        $this->assertSame(['live', 'It is open.', '<p>About Live.</p>'], [$list[0]['slug'], $list[0]['excerpt'], $list[0]['body']]);
        $this->getJson('/api/public/entries/live')->assertOk()->assertJsonPath('title', 'Live');
        $this->getJson('/api/public/entries/draft')->assertNotFound();
        $this->getJson('/api/public/entries/tomorrow')->assertNotFound();

        // A day later. Nobody saved anything in between.
        Carbon::setTestNow('2026-10-13 09:00:01');
        $this->getJson('/api/public/entries/tomorrow')->assertOk()->assertJsonPath('title', 'Tomorrow');
        $this->assertSame(['tomorrow', 'live'], array_column($this->getJson('/api/public/entries?sort=-publishedAt')->assertOk()->json('data'), 'slug'));
        $this->getJson('/api/public/entries/draft')->assertNotFound();
    }

    public function test_an_unpublished_post_leaves_the_site_and_one_in_the_trash_is_not_on_it(): void
    {
        $live = $this->entry('Live', ['publishedAt' => now()->subDay()->toJSON()]);
        $gone = $this->entry('Gone', ['publishedAt' => now()->subDay()->toJSON()]);

        $this->patchJson("/api/entries/{$live['id']}", ['publishedAt' => null])->assertOk();
        $this->deleteJson("/api/entries/{$gone['id']}")->assertNoContent();
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/public/entries')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/public/entries/live')->assertNotFound();
        $this->getJson('/api/public/entries/gone')->assertNotFound();
    }

    // --- nevela blog, where it has to say no

    public function test_the_command_says_what_a_resource_lacks_for_a_blog_and_writes_nothing(): void
    {
        $web = sys_get_temp_dir().DIRECTORY_SEPARATOR.'nevela-blog-'.bin2hex(random_bytes(4));
        config(['nevela.web_path' => $web]);

        $this->artisan('nevela:blog', ['--resource' => 'Nothing'])->expectsOutputToContain('There is no resource called Nothing.')->assertFailed();
        // The example shop's products can't be read publicly.
        $this->artisan('nevela:blog', ['--resource' => 'Product'])->expectsOutputToContain("Product can't be read publicly, and a blog is public.")->assertFailed();
        // A field the resource doesn't have, and one it has that isn't public.
        $this->artisan('nevela:blog', ['--resource' => 'Entry', '--body' => 'content'])->expectsOutputToContain('Entry has no field called content.')->assertFailed();
        $this->assertDirectoryDoesNotExist($web);
        $this->assertSame([], glob(base_path('app/Models/Entry.php')));
    }
}
