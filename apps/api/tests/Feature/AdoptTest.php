<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Console\GenerateCommand;
use Nevela\Laravel\Generator\ResourceGenerator;
use Nevela\Laravel\Generator\Writer;
use Nevela\Laravel\Nevela;
use Nevela\Laravel\Support\Adoption;
use Nevela\Laravel\Support\Descriptor;
use Nevela\Laravel\Support\Naming;
use Tests\TestCase;

/**
 * An app that had its tables before it had Nevela, over HTTP.
 *
 * The tables are made the way such an app made them: `$table->id()`, rows already in
 * them, foreign keys between them, a column Nevela has no kind for. They are adopted,
 * and the code that generates is loaded and used: every answer here comes from a
 * generated controller reading a table Nevela did not create.
 *
 * Beside them, two new resources whose ids differ from those of the resource they belong to.
 */
class AdoptTest extends TestCase
{
    use RefreshDatabase;

    /** Where the generated code is. Written once: a class can be loaded once in a process. */
    private static ?string $dir = null;

    /** @var list<string> */
    private const ADOPTED = ['internship_applications', 'transactions', 'posts', 'comments'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->tables();

        $first = self::$dir === null;
        self::$dir ??= sys_get_temp_dir().DIRECTORY_SEPARATOR.'nevela-adopt-'.bin2hex(random_bytes(4));
        config(['nevela.descriptors_path' => self::$dir.DIRECTORY_SEPARATOR.'descriptors']);
        Nevela::forget();
        if ($first) {
            $this->generate();
        }
        $all = Nevela::all();
        $generator = new ResourceGenerator;
        foreach ($all as $descriptor) {
            // What `php artisan migrate` would run: the trash for a table that was there,
            // and the table itself for a resource that is new.
            if ($descriptor->adopted) {
                $this->assertTrue(GenerateCommand::needsTrashMigration([], false, Schema::hasColumn($descriptor->table, 'deleted_at'), true));
                $this->migrate($generator->trashMigration($descriptor));
            } elseif (! Schema::hasTable($descriptor->table)) {
                $this->migrate($generator->migration($descriptor, $all));
            }
            if (method_exists($model = "App\\Models\\{$descriptor->name}", 'forgetTrash')) {
                $model::forgetTrash();
            }
        }
        $new = array_values(array_filter($all, fn (Descriptor $d) => ! in_array($d->name, ['Category', 'Product'], true)));
        Route::prefix('api')->middleware(config('nevela.middleware'))->group($this->file($generator->routes($new)->contents));

        Access::reset();
        Permissions::forget();
        $user = User::factory()->create();
        Access::grant($user, 'ADMIN');
        Sanctum::actingAs($user);
    }

    protected function tearDown(): void
    {
        Nevela::forget();
        parent::tearDown();
    }

    /** The app's own tables, as its own migrations made them, with what was in them. */
    private function tables(): void
    {
        Schema::create('internship_applications', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('phone')->nullable();
            $table->string('track');
            $table->string('cv_path')->nullable();
            $table->text('message')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
        });
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('internship_application_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference')->unique();
            $table->unsignedBigInteger('amount');
            $table->string('status')->default('pending');
            $table->timestamps();
        });
        // SQLite's own name for a JSON column is "text"; said outright, it is json here as it is on MySQL.
        DB::statement('alter table transactions add column gateway_response json');
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('body');
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });
        // And a length is only kept by SQLite when it is written out.
        DB::statement("alter table posts add column excerpt varchar(500) not null default ''");
        Schema::create('comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained();
            $table->string('author');
            $table->text('body');
            $table->timestamps();
        });
        Schema::create('newsletter_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->timestamps();
        });

        $now = now();
        $stamps = ['created_at' => $now, 'updated_at' => $now];
        DB::table('internship_applications')->insert([
            ['name' => 'Amara Okafor', 'email' => 'amara@example.com', 'track' => 'Backend', 'accepted_at' => null] + $stamps,
            // SQLite keeps no length for a string column, and this one holds more than the usual 255.
            ['name' => 'Kofi Mensah', 'email' => 'kofi@example.com', 'track' => str_repeat('d', 300), 'accepted_at' => $now] + $stamps,
        ]);
        DB::table('transactions')->insert([
            ['internship_application_id' => 1, 'reference' => 'TX-1', 'amount' => 150000, 'status' => 'successful', 'gateway_response' => '{"provider":"momo"}'] + $stamps,
            ['internship_application_id' => null, 'reference' => 'TX-2', 'amount' => 90000, 'status' => 'pending', 'gateway_response' => null] + $stamps,
        ]);
        DB::table('posts')->insert([
            ['title' => 'Opening day', 'slug' => 'opening-day', 'body' => 'We are open.', 'excerpt' => str_repeat('e', 400), 'published_at' => $now] + $stamps,
            ['title' => 'Summer intake', 'slug' => 'summer-intake', 'body' => 'Apply now.', 'excerpt' => 'Short.', 'published_at' => null] + $stamps,
        ]);
        DB::table('comments')->insert(['post_id' => 1, 'author' => 'Nia', 'body' => 'Congratulations!'] + $stamps);
    }

    /** Adopt the tables, describe the two new resources, and generate and load the code for all of them. */
    private function generate(): void
    {
        $dir = self::$dir;
        $all = array_map(fn (string $file) => Descriptor::fromJson((string) file_get_contents($file)), glob(base_path('nevela/resources/*.json')));
        $made = [];
        // Parents first: a foreign key is a relation once the table it points at is a resource.
        foreach (self::ADOPTED as $table) {
            $all[] = $made[] = Adoption::of($table, $all)->descriptor;
        }
        // A new resource with integer ids that belongs to one with UUIDs, and the reverse.
        $all[] = $made[] = Descriptor::fromSpec('Note', 'body:string, category:belongsTo(Category)', idType: 'int');
        $all[] = $made[] = Descriptor::fromSpec('Reply', 'body:string, post:belongsTo(Post)');

        mkdir($dir.'/descriptors', 0775, true);
        foreach ($all as $descriptor) {
            file_put_contents($dir.'/descriptors/'.Naming::kebab($descriptor->name).'.json', $descriptor->toJson());
        }

        $generator = new ResourceGenerator;
        $files = [];
        foreach ($made as $descriptor) {
            array_push($files, ...$generator->forResource($descriptor, '2026_10_11_000000', $all));
        }
        foreach ((new Writer(['api' => $dir.'/api', 'web' => $dir.'/web']))->write($files) as $row) {
            $this->assertSame('created', $row['status'], $row['path']);
            if (str_ends_with($row['path'], '.php') && ! str_contains($row['path'], 'migrations')) {
                require_once $row['path'];
            }
        }
    }

    private function migrate(string $migration): void
    {
        (require $this->file($migration))->up();
    }

    /** Generated code that isn't a class, in a file to be loaded from: a migration, the routes. */
    private function file(string $php): string
    {
        $path = self::$dir.DIRECTORY_SEPARATOR.'loaded'.DIRECTORY_SEPARATOR.sha1($php).'.php';
        if (! is_file($path)) {
            is_dir(dirname($path)) || mkdir(dirname($path), 0775, true);
            file_put_contents($path, $php);
        }

        return $path;
    }

    private function descriptor(string $name): Descriptor
    {
        return Nevela::resource($name);
    }

    // --- what adopting reads

    public function test_the_tables_are_read_as_they_are(): void
    {
        $post = $this->descriptor('Post');
        $this->assertSame('int', $post->idType);
        $this->assertTrue($post->adopted);
        $this->assertSame(['title', 'slug', 'body', 'publishedAt', 'excerpt'], array_keys($post->fields));
        $this->assertTrue($post->fields['slug']->unique);
        $this->assertSame(500, $post->fields['excerpt']->maxLength);
        $this->assertFalse($post->fields['publishedAt']->required);

        // A foreign key to a table that is a resource is a relation, required or not as the column is.
        $transaction = $this->descriptor('Transaction');
        $this->assertSame(['internshipApplicationId', 'reference', 'amount', 'status'], array_keys($transaction->fields));
        $this->assertSame('InternshipApplication', $transaction->fields['internshipApplicationId']->target);
        $this->assertFalse($transaction->fields['internshipApplicationId']->required);
        $this->assertTrue($this->descriptor('Comment')->fields['postId']->required);

        // No migration creates a table that is there, and the dashboard is told the length.
        $this->assertSame([], glob(self::$dir.'/api/database/migrations/*_create_posts_table.php'));
        $this->assertNotSame([], glob(self::$dir.'/api/database/migrations/*_create_notes_table.php'));
        $this->assertStringContainsString('excerpt: field.string({ maxLength: 500 }),', (string) file_get_contents(self::$dir.'/web/resources/post.resource.ts'));
        $this->assertStringNotContainsString('HasUuids', (string) file_get_contents(self::$dir.'/api/app/Models/Post.php'));
    }

    public function test_the_command_shows_what_it_read_and_writes_nothing_until_told_to(): void
    {
        $this->artisan('nevela:adopt', ['table' => 'newsletter_subscriptions'])
            ->expectsOutputToContain('newsletter_subscriptions as NewsletterSubscription, with integer ids')
            ->expectsOutputToContain('email:string!')
            ->expectsConfirmation('Make NewsletterSubscription a resource? The table is not changed', 'no')
            ->expectsOutputToContain('Nothing was written.')
            ->assertSuccessful();
        $this->assertFileDoesNotExist(self::$dir.'/descriptors/newsletter-subscription.json');
        $this->assertFileDoesNotExist(base_path('app/Models/NewsletterSubscription.php'));

        $this->artisan('nevela:adopt', ['table' => 'transactions'])->expectsOutputToContain('transactions is a resource already')->assertFailed();
        // Read again, a table stays the resource it is: under a second name it would be two.
        $this->artisan('nevela:adopt', ['table' => 'transactions', '--force' => true, '--name' => 'Payment'])->expectsOutputToContain('transactions is the Transaction resource')->assertFailed();
        $this->assertFileDoesNotExist(self::$dir.'/descriptors/payment.json');
        $this->artisan('nevela:adopt', ['table' => 'posts', '--force' => true, '--name' => 'post'])
            ->expectsOutputToContain('posts as Post, with integer ids')
            ->expectsConfirmation('Make Post a resource? The table is not changed', 'no')
            ->assertSuccessful();
        $this->artisan('nevela:adopt', ['table' => 'nowhere'])->expectsOutputToContain('There is no table called nowhere.')->assertFailed();
        $this->artisan('nevela:adopt', ['table' => 'nevela_roles'])->expectsOutputToContain('keeps for itself')->assertFailed();
        // A name another resource has.
        $this->artisan('nevela:adopt', ['table' => 'newsletter_subscriptions', '--name' => 'Category'])->expectsOutputToContain('There is a Category already, on the categories table.')->assertFailed();
        // A name the app's own code has: this app's User model was not written by Nevela, and is not written over.
        $this->artisan('nevela:adopt', ['table' => 'users', '--yes' => true])->expectsOutputToContain('The name User is taken by code of your own')->assertFailed();
        $this->assertFileDoesNotExist(self::$dir.'/descriptors/user.json');
        // A table whose key is not an id.
        $this->artisan('nevela:adopt', ['table' => 'cache'])->expectsOutputToContain("can't be a resource")->assertFailed();
    }

    // --- one adopted table

    public function test_records_that_were_there_are_listed_and_shown_with_string_ids(): void
    {
        $list = $this->getJson('/api/posts?sort=title')->assertOk()->assertJsonPath('meta.total', 2)->json('data');
        $this->assertSame(['1', '2'], array_column($list, 'id'));
        $this->assertSame('Opening day', $list[0]['title']);

        $this->getJson('/api/posts/2')->assertOk()->assertJsonPath('id', '2')->assertJsonPath('slug', 'summer-intake')->assertJsonPath('publishedAt', null);
        $this->getJson('/api/posts?q=summer')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', '2');
        $this->getJson('/api/posts/3')->assertNotFound();
        // Not a number, so not an id: no record's address, and no question for the database.
        $this->getJson('/api/posts/opening-day')->assertNotFound();
        $this->getJson('/api/posts/1e3')->assertNotFound();
    }

    public function test_a_record_is_created_changed_and_replaced(): void
    {
        $post = ['title' => 'Graduation', 'slug' => 'graduation', 'body' => 'Well done.', 'excerpt' => 'The class of 2026.'];

        $created = $this->postJson('/api/posts', $post)->assertCreated()->assertJsonPath('title', 'Graduation');
        $id = $created->json('id');
        $this->assertSame('3', $id);
        $this->assertStringEndsWith('/api/posts/3', $created->headers->get('Location'));

        $this->patchJson("/api/posts/{$id}", ['title' => 'Graduation day'])->assertOk()->assertJsonPath('id', '3')->assertJsonPath('title', 'Graduation day')->assertJsonPath('slug', 'graduation');
        // A PUT says everything: an optional field left out is cleared.
        $this->patchJson("/api/posts/{$id}", ['publishedAt' => '2026-10-11T09:00:00Z'])->assertOk();
        $this->putJson("/api/posts/{$id}", $post)->assertOk()->assertJsonPath('title', 'Graduation')->assertJsonPath('publishedAt', null);

        // What the table refuses, the API refuses first.
        $this->postJson('/api/posts', ['slug' => 'opening-day'] + $post)->assertStatus(422)->assertJsonPath('issues.0.path', 'slug');
        // A column the table doesn't have is not a field, and an id is not the sender's to choose.
        $this->postJson('/api/posts', ['slug' => 'prize-giving', 'views' => 1] + $post)->assertStatus(422)->assertJsonPath('issues.0.path', 'views');
        $this->postJson('/api/posts', ['slug' => 'prize-giving', 'id' => '99'] + $post)->assertCreated()->assertJsonPath('id', '4');
    }

    public function test_a_string_is_as_long_as_its_column(): void
    {
        // 400 characters were in the column before Nevela was: saving the record again is not refused.
        $this->patchJson('/api/posts/1', ['excerpt' => str_repeat('e', 400), 'title' => 'Opening day!'])->assertOk()->assertJsonPath('title', 'Opening day!');
        $this->patchJson('/api/posts/1', ['excerpt' => str_repeat('e', 500)])->assertOk();
        $this->patchJson('/api/posts/1', ['excerpt' => str_repeat('e', 501)])->assertStatus(422)->assertJsonPath('issues.0.path', 'excerpt');
        // A column that says nothing of its length is as long as what was found in it.
        $this->assertSame(65535, $this->descriptor('InternshipApplication')->fields['track']->maxLength);
        $this->assertNull($this->descriptor('InternshipApplication')->fields['name']->maxLength);
        $this->putJson('/api/internship-applications/2', ['name' => 'Kofi Mensah', 'email' => 'kofi@example.com', 'track' => str_repeat('d', 300)])->assertOk();
        // A column of the usual length has the usual limit.
        $this->patchJson('/api/posts/1', ['title' => str_repeat('t', 256)])->assertStatus(422)->assertJsonPath('issues.0.path', 'title');
    }

    public function test_a_deleted_record_goes_to_the_trash_and_comes_back(): void
    {
        $this->deleteJson('/api/posts/2')->assertNoContent();
        $this->getJson('/api/posts/2')->assertNotFound();
        $this->getJson('/api/posts')->assertOk()->assertJsonPath('meta.total', 1);
        // Kept, not removed.
        $this->assertNotNull(DB::table('posts')->where('id', 2)->value('deleted_at'));
        $this->getJson('/api/_nevela/trash/posts')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', '2')->assertJsonPath('data.0.label', 'Summer intake');

        $this->postJson('/api/_nevela/trash/posts/2/restore')->assertOk()->assertJsonPath('id', '2');
        $this->getJson('/api/posts/2')->assertOk();

        $this->deleteJson('/api/posts/2')->assertNoContent();
        $this->deleteJson('/api/_nevela/trash/posts/nonsense')->assertNotFound();
        $this->postJson('/api/_nevela/trash/posts/nonsense/restore')->assertNotFound();
        $this->deleteJson('/api/_nevela/trash/posts/2')->assertNoContent();
        $this->assertFalse(DB::table('posts')->where('id', 2)->exists());
    }

    public function test_until_the_table_has_the_column_a_delete_removes_the_record_as_it_always_did(): void
    {
        Schema::dropColumns('posts', ['deleted_at']);
        \App\Models\Post::forgetTrash();

        $this->getJson('/api/posts')->assertOk()->assertJsonPath('meta.total', 2);
        $this->deleteJson('/api/posts/2')->assertNoContent();
        $this->assertFalse(DB::table('posts')->where('id', 2)->exists());
    }

    public function test_several_are_created_at_once_and_counted(): void
    {
        $rows = [
            ['title' => 'One', 'slug' => 'one', 'body' => 'First.', 'excerpt' => ''],
            ['title' => 'Two', 'slug' => 'two', 'body' => 'Second.', 'excerpt' => ''],
        ];
        // The excerpt may not be empty where it is required; nothing is created.
        $this->postJson('/api/posts/_bulk', ['items' => $rows])->assertStatus(422)->assertJsonPath('rows.0.row', 1);
        $this->assertSame(2, DB::table('posts')->count());

        $rows = array_map(fn (array $row) => ['excerpt' => 'About '.$row['title']] + $row, $rows);
        $created = $this->postJson('/api/posts/_bulk', ['items' => $rows])->assertCreated()->assertJsonPath('created', 2)->json('data');
        $this->assertSame(['3', '4'], array_column($created, 'id'));

        $this->getJson('/api/posts/_stats')->assertOk()->assertJsonPath('total', 4)->assertJsonPath('current', 4);
        $this->getJson('/api/posts/_insights')->assertOk()->assertJsonPath('total', 4)->assertJsonCount(30, 'series');
    }

    public function test_an_integer_resource_can_be_seeded(): void
    {
        $this->artisan('nevela:seed', ['name' => 'Post', '--count' => 25])->assertSuccessful();
        $this->assertSame(27, DB::table('posts')->count());
        // Numbered on by the database from where the table was.
        $this->assertSame(27, (int) DB::table('posts')->max('id'));

        // A relation is drawn from the records that exist, whose ids are numbers too.
        $this->artisan('nevela:seed', ['name' => 'Comment', '--count' => 10])->assertSuccessful();
        $this->assertSame(11, DB::table('comments')->count());
        $this->assertSame(0, DB::table('comments')->whereNotIn('post_id', DB::table('posts')->select('id'))->count());
        $this->getJson('/api/comments?perPage=100')->assertOk()->assertJsonPath('meta.total', 11);
    }

    // --- two adopted tables with a foreign key between them

    public function test_a_relation_between_two_adopted_tables(): void
    {
        // A child says which parent it has, as a string, and the parent is there to read by it.
        $this->getJson('/api/transactions/1')->assertOk()->assertJsonPath('id', '1')->assertJsonPath('internshipApplicationId', '1');
        $this->getJson('/api/transactions/2')->assertOk()->assertJsonPath('internshipApplicationId', null);
        $this->getJson('/api/internship-applications/1')->assertOk()->assertJsonPath('name', 'Amara Okafor');
        // What the relation picker asks.
        $this->getJson('/api/internship-applications?q=kofi')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', '2');
        // A parent's page lists its children.
        $this->getJson('/api/transactions?filter[internshipApplicationId]=1')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.reference', 'TX-1');
        $this->getJson('/api/transactions?filter[internshipApplicationId]=null')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.reference', 'TX-2');
        // An id here is a number: a UUID, or a word, is nobody's.
        $this->getJson('/api/transactions?filter[internshipApplicationId]=one')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/transactions?filter[internshipApplicationId]=00000000-0000-7000-8000-000000000000')->assertOk()->assertJsonPath('meta.total', 0);

        // The dashboard sends the id it was given, a string; a script may send the number.
        $transaction = ['reference' => 'TX-3', 'amount' => 5000, 'status' => 'pending'];
        $this->postJson('/api/transactions', ['internshipApplicationId' => '2'] + $transaction)->assertCreated()->assertJsonPath('internshipApplicationId', '2');
        $this->postJson('/api/transactions', ['internshipApplicationId' => 2, 'reference' => 'TX-4'] + $transaction)->assertCreated()->assertJsonPath('internshipApplicationId', '2');
        $this->postJson('/api/transactions', ['reference' => 'TX-5'] + $transaction)->assertCreated()->assertJsonPath('internshipApplicationId', null);
        foreach ([99, 'two', '00000000-0000-7000-8000-000000000000', '99999999999999999999', -1, 1.5] as $nobody) {
            $this->postJson('/api/transactions', ['internshipApplicationId' => $nobody, 'reference' => 'TX-6'] + $transaction)
                ->assertStatus(422)->assertJsonPath('issues.0.path', 'internshipApplicationId');
        }
    }

    public function test_a_column_nevela_has_no_kind_for_is_left_as_it_is(): void
    {
        $this->assertArrayNotHasKey('gatewayResponse', $this->getJson('/api/transactions/1')->assertOk()->json());

        $this->patchJson('/api/transactions/1', ['amount' => 175000])->assertOk()->assertJsonPath('amount', 175000);
        $this->putJson('/api/transactions/1', ['reference' => 'TX-1', 'amount' => 180000, 'status' => 'successful'])->assertOk();
        $this->assertSame('{"provider":"momo"}', DB::table('transactions')->where('id', 1)->value('gateway_response'));

        // And it can't be written through the API either.
        $this->patchJson('/api/transactions/1', ['gatewayResponse' => ['provider' => 'other']])->assertStatus(422)->assertJsonPath('issues.0.path', 'gatewayResponse');
    }

    public function test_a_parent_its_children_must_have_is_not_deleted_from_under_them(): void
    {
        $this->getJson('/api/comments?filter[postId]=1')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.postId', '1');

        $this->deleteJson('/api/posts/1')->assertStatus(409)->assertJsonPath('error', '1 comment belongs to this post. Move or delete it first.');
        $this->getJson('/api/posts/1')->assertOk();

        // An optional parent lets go: the application is deleted, and its transaction stays.
        $this->deleteJson('/api/internship-applications/1')->assertNoContent();
        $this->getJson('/api/transactions/1')->assertOk();

        // A comment needs a post that exists.
        $this->postJson('/api/comments', ['author' => 'Omar', 'body' => 'Hello'])->assertStatus(422)->assertJsonPath('issues.0.path', 'postId');
        $this->postJson('/api/comments', ['postId' => '2', 'author' => 'Omar', 'body' => 'Hello'])->assertCreated()->assertJsonPath('postId', '2');
    }

    // --- ids of one kind pointing at ids of the other

    public function test_an_integer_resource_belongs_to_a_uuid_one_and_the_reverse(): void
    {
        $category = Category::create(['name' => 'Kitchen', 'slug' => 'kitchen']);

        // Integer ids of its own, a UUID for its parent.
        $note = $this->postJson('/api/notes', ['body' => 'Restock', 'categoryId' => $category->id])->assertCreated()->assertJsonPath('id', '1')->assertJsonPath('categoryId', $category->id);
        $this->postJson('/api/notes', ['body' => 'Restock', 'categoryId' => '1'])->assertStatus(422)->assertJsonPath('issues.0.path', 'categoryId');
        $this->getJson('/api/notes/'.$note->json('id'))->assertOk();
        $this->getJson("/api/notes?filter[categoryId]={$category->id}")->assertOk()->assertJsonPath('meta.total', 1);

        // A UUID of its own, a number for its parent.
        $reply = $this->postJson('/api/replies', ['body' => 'Agreed', 'postId' => '1'])->assertCreated()->assertJsonPath('postId', '1');
        $this->assertTrue(\Illuminate\Support\Str::isUuid($reply->json('id')));
        $this->postJson('/api/replies', ['body' => 'Agreed', 'postId' => $category->id])->assertStatus(422)->assertJsonPath('issues.0.path', 'postId');
        $this->getJson('/api/replies/'.$reply->json('id'))->assertOk()->assertJsonPath('body', 'Agreed');
        $this->getJson('/api/replies?filter[postId]=1')->assertOk()->assertJsonPath('meta.total', 1);
        // Its parent can't be deleted from under it, whatever kind of id either has.
        DB::table('comments')->delete();
        $this->deleteJson('/api/posts/1')->assertStatus(409)->assertJsonPath('error', '1 reply belongs to this post. Move or delete it first.');

        $this->artisan('nevela:seed', ['name' => 'Note', '--count' => 5])->assertSuccessful();
        $this->artisan('nevela:seed', ['name' => 'Reply', '--count' => 5])->assertSuccessful();
        $this->assertSame(6, DB::table('notes')->count());
        $this->assertSame(6, DB::table('replies')->count());
    }
}
