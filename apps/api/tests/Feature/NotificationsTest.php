<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Auth\AuthMail;
use Nevela\Laravel\Forms\ConfirmAddress;
use Nevela\Laravel\Forms\FormGuard;
use Nevela\Laravel\Models\Role;
use Nevela\Laravel\Nevela;
use Nevela\Laravel\Notices\Announce;
use Nevela\Laravel\Notices\Conditions;
use Nevela\Laravel\Notices\Notice;
use Nevela\Laravel\Notices\Notices;
use Nevela\Laravel\Support\Descriptor;
use Nevela\Laravel\Support\SchemaFacts;
use RuntimeException;
use Tests\GeneratesResources;
use Tests\TestCase;

/**
 * The dashboard's bell: who is told what, one line per kind while unread, and what an
 * administrator is shown about the app itself.
 */
class NotificationsTest extends TestCase
{
    use GeneratesResources, RefreshDatabase;

    private const PASSWORD = 'correct horse battery staple';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        Mail::fake();
        Cache::flush();
        AuthMail::$outbox = [];
        config(['nevela.public.turnstile.secret' => null, 'nevela.public.turnstile.hostnames' => null, 'nevela.auth.web_url' => 'http://localhost:3000']);
        FormGuard::$takesMail = fn (string $domain) => true;
        $this->resources(fn () => [
            Descriptor::fromArray([
                'name' => 'Lead',
                'fields' => ['name' => ['kind' => 'string'], 'email' => ['kind' => 'string', 'format' => 'email'], 'message' => ['kind' => 'text']],
                'public' => ['create' => ['fields' => ['name', 'email', 'message']]],
            ]),
            Descriptor::fromArray([
                'name' => 'Member',
                'fields' => ['email' => ['kind' => 'string', 'format' => 'email', 'unique' => true]],
                'public' => ['create' => ['fields' => ['email'], 'confirm' => 'email']],
            ]),
        ]);
    }

    private function user(string ...$roles): User
    {
        $user = User::factory()->create(['password' => Hash::make(self::PASSWORD)]);
        foreach ($roles as $role) {
            $this->assertTrue(Access::grant($user, $role), "no role called {$role}");
        }

        return $user->refresh();
    }

    /** @return list<object> */
    private function rowsOf(User $user): array
    {
        return DB::table('nevela_notifications')->where('user_id', (string) $user->getKey())->orderBy('created_at')->orderBy('id')->get()->all();
    }

    // --- forms

    public function test_a_form_sent_tells_those_who_may_see_it_as_one_line_while_unread(): void
    {
        $admin = $this->user('ADMIN');
        Role::query()->create(['name' => 'Sales', 'description' => null, 'grants' => ['leads.view'], 'is_system' => false]);
        $sales = $this->user('Sales');
        $other = $this->user('USER');

        $this->postJson('/api/public/leads', ['name' => 'Ada Lovelace', 'email' => 'ada@example.com', 'message' => 'Hello'])->assertCreated();
        $first = DB::table('leads')->value('id');
        foreach ([$admin, $sales] as $told) {
            [$row] = $this->rowsOf($told);
            $this->assertSame('New lead: Ada Lovelace', $row->title);
            $this->assertSame("/dashboard/leads/{$first}", $row->url);
            $this->assertSame('form.received', $row->kind);
        }
        $this->assertSame([], $this->rowsOf($other));

        // A second before the first is read: the same line, counted, pointing at the list.
        $this->postJson('/api/public/leads', ['name' => 'Grace Hopper', 'email' => 'grace@example.com', 'message' => 'Hi'])->assertCreated();
        $rows = $this->rowsOf($sales);
        $this->assertCount(1, $rows);
        $this->assertSame(2, (int) $rows[0]->count);
        $this->assertSame('2 new leads', $rows[0]->title);
        $this->assertSame('/dashboard/leads', $rows[0]->url);

        // Once read, the next one is a line of its own.
        Sanctum::actingAs($sales);
        $this->getJson('/api/_nevela/notifications')->assertOk()->assertJsonPath('unread', 1)->assertJsonPath('items.0.count', 2)->assertJsonPath('items.0.read', false)->assertJsonPath('conditions', []);
        $this->postJson('/api/_nevela/notifications/read', ['id' => $rows[0]->id])->assertOk()->assertJsonPath('read', 1);
        $this->postJson('/api/public/leads', ['name' => 'Katherine Johnson', 'email' => 'kj@example.com', 'message' => 'Hey'])->assertCreated();
        $this->getJson('/api/_nevela/notifications')->assertOk()
            ->assertJsonPath('unread', 1)
            ->assertJsonPath('items.0.title', 'New lead: Katherine Johnson')
            ->assertJsonPath('items.1.read', true);
    }

    public function test_a_list_tells_of_someone_once_their_address_is_confirmed(): void
    {
        $admin = $this->user('ADMIN');

        $this->postJson('/api/public/members', ['email' => 'kofi@example.com'])->assertCreated();
        $this->assertSame([], $this->rowsOf($admin), 'an address not yet proved is nobody yet');

        $mail = Mail::queued(ConfirmAddress::class)->last();
        parse_str((string) parse_url($mail->url, PHP_URL_QUERY), $link);
        $this->postJson("/api/public/_nevela/confirm/members/{$link['id']}/{$link['key']}")->assertOk();
        $this->postJson("/api/public/_nevela/confirm/members/{$link['id']}/{$link['key']}")->assertOk();

        $rows = $this->rowsOf($admin);
        $this->assertCount(1, $rows, 'following the link twice tells once');
        $this->assertSame('Member confirmed: kofi@example.com', $rows[0]->title);
    }

    // --- accounts

    public function test_signing_up_and_closing_an_account_tell_whoever_manages_people(): void
    {
        $admin = $this->user('ADMIN');
        $other = $this->user('USER');
        config(['nevela.auth.registration' => true]);

        $this->postJson('/api/auth/register', ['name' => 'Mei', 'email' => 'mei@example.com', 'password' => self::PASSWORD])->assertCreated();
        $mei = User::query()->where('email', 'mei@example.com')->firstOrFail();
        [$row] = $this->rowsOf($admin);
        $this->assertSame('New account: Mei', $row->title);
        $this->assertSame('mei@example.com', $row->body);
        $this->assertSame("/dashboard/access/users/{$mei->getKey()}", $row->url);
        $this->assertSame([], $this->rowsOf($other));
        $this->assertSame([], $this->rowsOf($mei), 'nobody is told about themselves');

        Sanctum::actingAs($mei);
        $this->postJson('/api/auth/close', ['password' => self::PASSWORD])->assertOk();
        $closed = collect($this->rowsOf($admin))->firstWhere('kind', 'account.closed');
        $this->assertSame('Mei closed their account', $closed->title);
        $this->assertSame('/dashboard/access/deleted', $closed->url);
    }

    public function test_changes_to_how_you_sign_in_are_told_to_you_alone(): void
    {
        $admin = $this->user('ADMIN');
        $ada = $this->user('USER');

        Sanctum::actingAs($ada);
        $this->postJson('/api/auth/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'a brand new passphrase'])->assertOk();
        $this->postJson('/api/auth/two-factor/enable', ['password' => 'a brand new passphrase', 'method' => 'email'])->assertOk();
        $this->postJson('/api/auth/two-factor/disable', ['password' => 'a brand new passphrase'])->assertOk();

        $rows = $this->rowsOf($ada);
        $this->assertSame(['Your password was changed', 'Two-step sign-in is on', 'Two-step sign-in was turned off'], array_column($rows, 'title'));
        $this->assertSame('warning', $rows[2]->tone);
        $this->assertSame([], $this->rowsOf($admin));
    }

    public function test_an_administrator_changing_your_roles_or_password_tells_you(): void
    {
        $admin = $this->user('ADMIN');
        $ada = $this->user('USER');
        $editor = Role::query()->where('name', 'EDITOR')->firstOrFail();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/_nevela/users/{$ada->getKey()}", ['roles' => [$editor->id]])->assertOk();
        $this->patchJson("/api/_nevela/users/{$ada->getKey()}", ['roles' => [$editor->id]])->assertOk();
        $this->patchJson("/api/_nevela/users/{$ada->getKey()}", ['password' => 'another long passphrase'])->assertOk();

        $this->assertSame(['Your role is now EDITOR', 'An administrator set a new password for you'], array_column($this->rowsOf($ada), 'title'), 'the same roles again is no change');
        $this->assertSame([], $this->rowsOf($admin));
    }

    // --- the app itself

    public function test_a_failed_job_is_told_to_administrators_once_per_kind(): void
    {
        $admin = $this->user('ADMIN');
        $other = $this->user('EDITOR');
        $job = $this->createMock(Job::class);
        $job->method('resolveName')->willReturn('App\\Jobs\\SendInvoice');

        event(new JobFailed('database', $job, new RuntimeException("Card declined\nat line 3")));
        [$row] = $this->rowsOf($admin);
        $this->assertSame('A background job failed: SendInvoice', $row->title);
        $this->assertSame('Card declined', $row->body);
        $this->assertSame('warning', $row->tone);

        event(new JobFailed('database', $job, new RuntimeException('Card declined')));
        $rows = $this->rowsOf($admin);
        $this->assertCount(1, $rows);
        $this->assertSame('SendInvoice failed 2 times', $rows[0]->title);
        $this->assertSame([], $this->rowsOf($other));
    }

    public function test_the_trash_being_emptied_is_told_to_administrators(): void
    {
        $admin = $this->user('ADMIN');

        Announce::trashEmptied(['Product' => 3, 'Category' => 1], 30);
        Announce::trashEmptied([], 30);

        [$row] = $this->rowsOf($admin);
        $this->assertSame('4 records were removed from the trash for good', $row->title);
        $this->assertSame('Deleted more than 30 days ago: Product (3), Category (1).', $row->body);
    }

    public function test_administrators_see_what_is_wrong_with_the_app_while_it_is(): void
    {
        $admin = $this->user('ADMIN');
        $other = $this->user('USER');
        $this->app['env'] = 'production';
        // Mail to the log is the problem here. The cache is one a real server could have,
        // in the database, which is emptied for each test.
        config(['mail.default' => 'log', 'cache.default' => 'database']);
        Cache::put(Conditions::LATEST, '99.0.0');

        Sanctum::actingAs($admin);
        $conditions = collect($this->getJson('/api/_nevela/notifications')->assertOk()->json('conditions'))->keyBy('id');
        $this->assertSame('Nevela 99.0.0 is out', $conditions['release']['title']);
        $this->assertSame('info', $conditions['release']['tone']);
        $this->assertSame("The scheduler isn't running", $conditions['scheduler']['title']);
        $this->assertSame("Emails aren't being sent", $conditions['mail']['title']);
        $this->assertFalse($conditions->has('migrations'));

        Sanctum::actingAs($other);
        $this->getJson('/api/_nevela/notifications')->assertOk()->assertJsonPath('conditions', []);

        // Upgraded, and the scheduler running: those go once worked out again.
        Cache::put(Conditions::LATEST, Nevela::VERSION);
        Cache::forever('nevela:scheduler:ran-at', time());
        Conditions::forget();
        Sanctum::actingAs($admin);
        $this->assertSame(['mail'], array_column($this->getJson('/api/_nevela/notifications')->json('conditions'), 'id'));
    }

    // --- reading them

    public function test_each_person_reads_and_marks_only_their_own(): void
    {
        $ada = $this->user('USER');
        $bo = $this->user('USER');
        Notices::send([$ada, $bo], new Notice('Your order has shipped', url: '/dashboard/orders/1'));
        Notices::send($ada, new Notice('A second thing'));
        $bos = $this->rowsOf($bo)[0]->id;

        Sanctum::actingAs($ada);
        $this->postJson('/api/_nevela/notifications/read', ['id' => $bos])->assertOk()->assertJsonPath('read', 0);
        $this->getJson('/api/_nevela/notifications')->assertOk()->assertJsonPath('unread', 2)->assertJsonCount(2, 'items');
        $this->postJson('/api/_nevela/notifications/read')->assertOk()->assertJsonPath('read', 2);
        $this->getJson('/api/_nevela/notifications')->assertJsonPath('unread', 0);

        Sanctum::actingAs($bo);
        $this->getJson('/api/_nevela/notifications')->assertJsonPath('unread', 1)->assertJsonPath('items.0.url', '/dashboard/orders/1');

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/_nevela/notifications')->assertUnauthorized();
    }

    public function test_old_ones_are_pruned_and_nothing_breaks_before_the_table_exists(): void
    {
        $ada = $this->user('USER');
        Notices::send($ada, new Notice('Old and read'));
        Notices::send($ada, new Notice('Recent'));
        DB::table('nevela_notifications')->where('title', 'Old and read')->update(['read_at' => now()->subDays(100), 'updated_at' => now()->subDays(100)]);
        $this->assertSame(1, Notices::prune());
        $this->assertSame(['Recent'], array_column($this->rowsOf($ada), 'title'));

        // An upgraded app that hasn't migrated yet: nothing is told, and the bell is empty.
        Schema::drop('nevela_notifications');
        SchemaFacts::forget();
        $this->assertSame(0, Notices::send($ada, new Notice('Lost')));
        Sanctum::actingAs($ada);
        $this->getJson('/api/_nevela/notifications')->assertOk()->assertJsonPath('items', [])->assertJsonPath('unread', 0);
    }
}
