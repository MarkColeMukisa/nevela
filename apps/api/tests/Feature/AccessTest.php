<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Nevela\Laravel\Access\Access;
use Nevela\Laravel\Access\Permissions;
use Nevela\Laravel\Access\SampleUsers;
use Nevela\Laravel\Auth\AuthMail;
use Nevela\Laravel\Models\Role;
use Tests\TestCase;

/**
 * Roles and permissions, over HTTP: what each role may do with the example shop, and the
 * rules that keep managing users and roles from being a way to take more than you hold.
 */
class AccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Access::reset();
        Permissions::forget();
        AuthMail::$outbox = [];
    }

    private function user(string ...$roles): User
    {
        $user = User::factory()->create();
        foreach ($roles as $role) {
            $this->assertTrue(Access::grant($user, $role), "no role called {$role}");
        }

        return $user->refresh();
    }

    private function role(string $name): Role
    {
        return Role::query()->where('name', $name)->firstOrFail();
    }

    /** @param list<string> $grants */
    private function makeRole(string $name, array $grants): Role
    {
        return Role::query()->create(['name' => $name, 'description' => null, 'grants' => $grants, 'is_system' => false]);
    }

    // --- the permissions themselves

    public function test_every_resource_and_the_built_in_features_are_in_the_catalog(): void
    {
        $keys = Permissions::keys();
        foreach (['products.view', 'products.create', 'products.edit', 'products.delete', 'categories.view', 'users.edit', 'roles.delete'] as $key) {
            $this->assertContains($key, $keys);
        }
        $this->assertSame(['access', 'resources'], array_column(Permissions::catalog(), 'key'));

        // An app's own, from config/nevela.php.
        config(['nevela.permissions' => ['reports' => ['name' => 'Reports', 'actions' => ['view']], 'users' => ['name' => 'Taken']]]);
        Permissions::forget();
        $this->assertContains('reports.view', Permissions::keys());
        $this->assertNotContains('reports.delete', Permissions::keys());
        $this->assertSame(['access', 'resources', 'app'], array_column(Permissions::catalog(), 'key'));
    }

    public function test_a_grant_covers_what_it_says_and_nothing_wider(): void
    {
        $this->assertTrue(Permissions::matches('*', 'products.delete'));
        $this->assertTrue(Permissions::matches('products.view', 'products.view'));
        $this->assertFalse(Permissions::matches('products.view', 'products.edit'));
        $this->assertTrue(Permissions::matches('products.*', 'products.delete'));
        $this->assertFalse(Permissions::matches('products.*', 'categories.view'));
        // Checked to its end: "everything, viewing only" is not "everything".
        $this->assertTrue(Permissions::matches('*.view', 'products.view'));
        $this->assertFalse(Permissions::matches('*.view', 'products.delete'));
        // Every resource, and not the users and roles beside them.
        $this->assertTrue(Permissions::matches('@resources.*', 'products.delete'));
        $this->assertTrue(Permissions::matches('@resources.view', 'categories.view'));
        $this->assertFalse(Permissions::matches('@resources.view', 'categories.edit'));
        $this->assertFalse(Permissions::matches('@resources.*', 'users.view'));
        $this->assertTrue(Permissions::matches('@access.*', 'roles.edit'));
        // Nothing that isn't a permission.
        $this->assertFalse(Permissions::matches('products', 'products.view'));
        $this->assertFalse(Permissions::matches('products.view.extra', 'products.view'));

        $this->assertSame(['categories.view', 'products.view'], Permissions::expand(['@resources.view']));
        $this->assertTrue(Permissions::hasAll(['*']));
        $this->assertTrue(Permissions::hasAll(['@resources.*', '@access.*']));
        $this->assertFalse(Permissions::hasAll(['@resources.*', 'users.*']));
    }

    public function test_nobody_can_hand_out_more_than_they_hold(): void
    {
        $this->assertSame([], Permissions::beyond(['*'], ['*', 'users.delete']));
        $this->assertSame([], Permissions::beyond(['products.*'], ['products.view', 'products.*']));
        $this->assertSame(['products.delete'], Permissions::beyond(['products.view', 'products.edit'], ['products.view', 'products.delete']));
        // A pattern is held only when everything it comes to is.
        $this->assertSame(['products.*'], Permissions::beyond(['products.view'], ['products.*']));
        $this->assertSame(['*'], Permissions::beyond(['@resources.*', '@access.*'], ['*']));
        $this->assertSame(['@resources.*'], Permissions::beyond(['products.*'], ['@resources.*']));
        $this->assertSame([], Permissions::beyond(['products.*', 'categories.*'], ['@resources.*']));

        $this->assertTrue(Permissions::understood('@resources.*'));
        $this->assertTrue(Permissions::understood('*.view'));
        $this->assertFalse(Permissions::understood('unicorns.view'));
        $this->assertFalse(Permissions::understood('products.publish'));
        $this->assertFalse(Permissions::understood('@nowhere.*'));
    }

    // --- what the migration leaves behind

    public function test_an_app_starts_with_three_roles_that_cannot_be_deleted(): void
    {
        $roles = Role::query()->orderBy('name')->get();
        $this->assertSame(['ADMIN', 'EDITOR', 'USER'], $roles->pluck('name')->all());
        $this->assertTrue($roles->every(fn (Role $role) => $role->is_system));
        $this->assertSame(['*'], $this->role('ADMIN')->grants);
        $this->assertSame([], $this->role('USER')->grants);
    }

    public function test_upgrading_makes_every_existing_user_an_administrator(): void
    {
        // An app from before roles: users, and no roles tables.
        Schema::drop('nevela_role_user');
        Schema::drop('nevela_roles');
        DB::table('migrations')->where('migration', 'like', '%create_nevela_access_tables')->delete();
        Access::reset();
        $first = User::factory()->create();
        $second = User::factory()->create();

        // Until the migration runs, everyone can do everything, as they could.
        $this->assertTrue($first->can('products.delete'));
        Sanctum::actingAs($first);
        $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.isAdmin', true);
        $this->getJson('/api/products')->assertOk();
        $this->getJson('/api/_nevela/users')->assertStatus(409)->assertJsonPath('code', 'MIGRATION_NEEDED');

        $this->artisan('migrate')->assertSuccessful();
        Access::reset();

        foreach ([$first, $second] as $user) {
            $this->assertSame(['ADMIN'], Access::rolesOf($user)->pluck('name')->all());
            $this->assertTrue(User::find($user->id)->can('users.delete'));
        }
    }

    // --- what each role may do

    public function test_a_user_with_no_grants_reaches_their_own_account_and_nothing_else(): void
    {
        Sanctum::actingAs($this->user('USER'));

        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('user.roles', ['USER'])->assertJsonPath('user.permissions', [])->assertJsonPath('user.isAdmin', false);
        $this->getJson('/api/products')->assertForbidden();
        $this->postJson('/api/categories', ['name' => 'Kitchen', 'slug' => 'kitchen'])->assertForbidden();
        $this->getJson('/api/_nevela/users')->assertForbidden();
        $this->getJson('/api/_nevela/roles')->assertForbidden();
        $this->getJson('/api/_nevela/permissions')->assertForbidden();
    }

    public function test_an_editor_works_with_records_and_manages_no_one(): void
    {
        Sanctum::actingAs($this->user('EDITOR'));

        $this->postJson('/api/categories', ['name' => 'Kitchen', 'slug' => 'kitchen'])->assertCreated();
        $this->getJson('/api/products')->assertOk();
        $category = Category::query()->firstOrFail();
        $this->patchJson("/api/categories/{$category->id}", ['name' => 'Cookware'])->assertOk();
        $this->deleteJson("/api/categories/{$category->id}")->assertNoContent();

        // They can see who the users are, and the roles those users hold.
        $this->getJson('/api/_nevela/users')->assertOk();
        $this->getJson('/api/_nevela/roles')->assertOk();
        $this->postJson('/api/_nevela/users', ['name' => 'New', 'email' => 'new@example.com', 'password' => 'a-long-password', 'roles' => []])->assertForbidden();
        $this->postJson('/api/_nevela/roles', ['name' => 'Mine', 'grants' => []])->assertForbidden();
        $this->getJson('/api/_nevela/permissions')->assertForbidden();
    }

    public function test_a_role_of_your_own_allows_exactly_what_it_grants(): void
    {
        $this->makeRole('Catalogue', ['products.view', 'categories.*']);
        Sanctum::actingAs($this->user('Catalogue'));

        $this->getJson('/api/auth/me')->assertJsonPath('user.permissions', ['categories.create', 'categories.delete', 'categories.edit', 'categories.view', 'products.view']);
        $this->getJson('/api/products')->assertOk();
        $this->postJson('/api/products', ['name' => 'Kettle'])->assertForbidden();
        $this->postJson('/api/categories', ['name' => 'Kitchen', 'slug' => 'kitchen'])->assertCreated();
    }

    public function test_roles_add_up(): void
    {
        $this->makeRole('Viewer', ['@resources.view']);
        $this->makeRole('Product editor', ['products.edit']);
        $user = $this->user('Viewer', 'Product editor');

        $this->assertTrue($user->can('products.view'));
        $this->assertTrue($user->can('products.edit'));
        $this->assertFalse($user->can('categories.edit'));
        $this->assertFalse(Access::isAdmin($user));
    }

    // --- managing users

    public function test_an_administrator_creates_edits_and_deletes_users(): void
    {
        Sanctum::actingAs($admin = $this->user('ADMIN'));
        $editor = $this->role('EDITOR');

        $created = $this->postJson('/api/_nevela/users', ['name' => 'Amara Okafor', 'email' => 'Amara@Example.com', 'password' => 'a-long-password', 'roles' => [$editor->id]])
            ->assertCreated()
            ->assertJsonPath('email', 'amara@example.com')->assertJsonPath('roles.0.name', 'EDITOR')
            ->assertJsonPath('active', true)->assertJsonPath('isAdmin', false)->assertJsonPath('emailVerified', false);
        $id = $created->json('id');

        $this->postJson('/api/_nevela/users', ['name' => 'Again', 'email' => 'amara@example.com', 'password' => 'a-long-password', 'roles' => []])
            ->assertStatus(422)->assertJsonPath('issues.0.path', 'email');

        $this->getJson('/api/_nevela/users?q=amara')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $id);
        $this->getJson("/api/_nevela/users?role={$editor->id}")->assertJsonPath('meta.total', 1);
        $this->getJson('/api/_nevela/users')->assertJsonPath('meta.total', 2);
        $this->getJson("/api/_nevela/users/{$admin->id}")->assertJsonPath('isSelf', true)->assertJsonPath('isAdmin', true);

        $this->patchJson("/api/_nevela/users/{$id}", ['name' => 'Amara O.', 'roles' => [$this->role('USER')->id]])
            ->assertOk()->assertJsonPath('name', 'Amara O.')->assertJsonPath('roles.0.name', 'USER');

        $this->deleteJson("/api/_nevela/users/{$id}")->assertNoContent();
        // Deleted is closed and kept, out of the list (ClosedAccountsTest has the rest).
        $this->assertNotNull(User::find($id)?->closed_at);
        $this->getJson('/api/_nevela/users')->assertJsonPath('meta.total', 1);
        $this->getJson("/api/_nevela/users/{$id}")->assertNotFound();
        $this->getJson('/api/_nevela/users/nobody')->assertNotFound();
    }

    public function test_a_switched_off_account_is_signed_out_and_cannot_sign_in(): void
    {
        $person = $this->user('EDITOR');
        $person->forceFill(['password' => bcrypt('a-long-password')])->save();
        $token = $person->createToken('laptop')->plainTextToken;
        Sanctum::actingAs($this->user('ADMIN'));

        $this->patchJson("/api/_nevela/users/{$person->id}", ['active' => false])->assertOk()->assertJsonPath('active', false);

        $this->assertSame(0, $person->tokens()->count(), 'every device is signed out');
        $this->assertFalse(User::find($person->id)->can('products.view'), 'and its roles count for nothing');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/token', ['email' => $person->email, 'password' => 'a-long-password'])
            ->assertForbidden()->assertJsonPath('code', 'ACCOUNT_DISABLED');
        $this->assertNotEmpty($token);
    }

    public function test_a_new_password_from_an_administrator_signs_the_person_out_and_tells_them(): void
    {
        $person = $this->user('USER');
        $person->createToken('laptop');
        Sanctum::actingAs($this->user('ADMIN'));

        $this->patchJson("/api/_nevela/users/{$person->id}", ['password' => 'short'])->assertStatus(422);
        $this->patchJson("/api/_nevela/users/{$person->id}", ['password' => 'another-long-password'])->assertOk();

        $this->assertSame(0, $person->tokens()->count());
        $this->assertCount(1, AuthMail::$outbox);
        $this->assertSame($person->email, AuthMail::$outbox[0]['email']);

        $person->createToken('phone');
        $this->deleteJson("/api/_nevela/users/{$person->id}/sessions")->assertOk()->assertJsonPath('revoked', 1);
    }

    public function test_managing_users_is_not_a_way_to_take_more_than_you_hold(): void
    {
        $this->makeRole('People', ['users.*']);
        $admin = $this->user('ADMIN');
        $person = $this->user('USER');
        Sanctum::actingAs($manager = $this->user('People'));

        // Not by making an administrator, of themselves or of anyone.
        $this->patchJson("/api/_nevela/users/{$manager->id}", ['roles' => [$this->role('ADMIN')->id]])->assertForbidden()->assertJsonPath('code', 'BEYOND_YOUR_OWN');
        $this->patchJson("/api/_nevela/users/{$person->id}", ['roles' => [$this->role('EDITOR')->id]])->assertForbidden()->assertJsonPath('code', 'BEYOND_YOUR_OWN');
        $this->postJson('/api/_nevela/users', ['name' => 'Friend', 'email' => 'friend@example.com', 'password' => 'a-long-password', 'roles' => [$this->role('ADMIN')->id]])->assertForbidden();
        // Not by taking over an administrator's account.
        $this->patchJson("/api/_nevela/users/{$admin->id}", ['password' => 'a-password-i-know'])->assertForbidden()->assertJsonPath('code', 'ADMIN_ONLY');
        $this->patchJson("/api/_nevela/users/{$admin->id}", ['email' => 'mine@example.com'])->assertForbidden();
        $this->deleteJson("/api/_nevela/users/{$admin->id}")->assertForbidden();
        $this->deleteJson("/api/_nevela/users/{$admin->id}/sessions")->assertForbidden();

        // Nor anyone else's who may do something they may not: an editor has the records, and they don't.
        $editor = $this->user('EDITOR');
        $this->patchJson("/api/_nevela/users/{$editor->id}", ['password' => 'a-password-i-know'])->assertForbidden()->assertJsonPath('code', 'ABOVE_YOUR_OWN');
        $this->patchJson("/api/_nevela/users/{$editor->id}", ['email' => 'mine@example.com'])->assertForbidden();
        $this->patchJson("/api/_nevela/users/{$editor->id}", ['name' => 'Renamed'])->assertForbidden();
        $this->patchJson("/api/_nevela/users/{$editor->id}", ['active' => false])->assertForbidden();
        $this->deleteJson("/api/_nevela/users/{$editor->id}")->assertForbidden()->assertJsonPath('code', 'ABOVE_YOUR_OWN');
        $this->deleteJson("/api/_nevela/users/{$editor->id}/sessions")->assertForbidden();
        $this->assertSame($editor->email, User::find($editor->id)->email);
        // Switched off, an administrator is still not theirs to give a password and switch back on.
        $off = $this->user('ADMIN');
        $off->forceFill(['active' => false])->save();
        $this->patchJson("/api/_nevela/users/{$off->id}", ['password' => 'a-password-i-know', 'active' => true])->assertForbidden()->assertJsonPath('code', 'ADMIN_ONLY');

        // The list says which accounts are theirs to change, so the dashboard offers nothing it would be refused.
        $listed = collect($this->getJson('/api/_nevela/users')->assertOk()->json('data'))->keyBy('id');
        $this->assertFalse($listed[(string) $admin->id]['withinYours']);
        $this->assertFalse($listed[(string) $editor->id]['withinYours']);
        $this->assertTrue($listed[(string) $person->id]['withinYours']);

        // What they hold, they can hand out, to someone who may do no more than they may.
        $this->patchJson("/api/_nevela/users/{$person->id}", ['name' => 'Renamed', 'roles' => [$this->role('People')->id, $this->role('USER')->id]])->assertOk();
        $this->patchJson("/api/_nevela/users/{$person->id}", ['password' => 'a-new-long-password'])->assertOk();
        // And their own account is theirs, whatever else is.
        $this->patchJson("/api/_nevela/users/{$manager->id}", ['name' => 'Still me'])->assertOk();
    }

    public function test_the_last_administrator_cannot_be_removed_switched_off_or_demoted(): void
    {
        Sanctum::actingAs($admin = $this->user('ADMIN'));
        $other = $this->user('ADMIN');

        // With two, either can go.
        $this->patchJson("/api/_nevela/users/{$other->id}", ['roles' => [$this->role('USER')->id]])->assertOk();

        // With one, nothing that would leave the app without anyone to manage it.
        $this->patchJson("/api/_nevela/users/{$admin->id}", ['roles' => [$this->role('EDITOR')->id]])->assertStatus(409)->assertJsonPath('code', 'LAST_ADMIN');
        $this->patchJson("/api/_nevela/users/{$admin->id}", ['active' => false])->assertStatus(409)->assertJsonPath('code', 'SELF');
        $this->deleteJson("/api/_nevela/users/{$admin->id}")->assertStatus(409)->assertJsonPath('code', 'SELF');

        // A switched-off administrator doesn't count as one who can still get in.
        $spare = $this->user('ADMIN');
        $this->patchJson("/api/_nevela/users/{$spare->id}", ['active' => false])->assertOk();
        $this->patchJson("/api/_nevela/users/{$admin->id}", ['roles' => []])->assertStatus(409)->assertJsonPath('code', 'LAST_ADMIN');

        // Someone else trying it on the last one is refused too.
        $second = $this->user('ADMIN');
        Sanctum::actingAs($second);
        $this->deleteJson("/api/_nevela/users/{$admin->id}")->assertNoContent();
        $this->patchJson("/api/_nevela/users/{$second->id}", ['roles' => []])->assertStatus(409)->assertJsonPath('code', 'LAST_ADMIN');
    }

    // --- managing roles

    public function test_an_administrator_makes_edits_and_deletes_roles(): void
    {
        Sanctum::actingAs($this->user('ADMIN'));

        $catalog = $this->getJson('/api/_nevela/permissions')->assertOk();
        $this->assertSame(count(Permissions::keys()), $catalog->json('total'));
        $this->assertSame('Access', $catalog->json('modules.0.name'));

        $id = $this->postJson('/api/_nevela/roles', ['name' => 'Support', 'description' => 'Reads everything.', 'grants' => ['@resources.view', 'users.view', 'users.view']])
            ->assertCreated()
            ->assertJsonPath('grants', ['@resources.view', 'users.view'])
            ->assertJsonPath('permissions', ['categories.view', 'products.view', 'users.view'])
            ->assertJsonPath('isSystem', false)->assertJsonPath('users', 0)
            ->json('id');

        $this->postJson('/api/_nevela/roles', ['name' => 'support', 'grants' => []])->assertStatus(422);
        $this->postJson('/api/_nevela/roles', ['name' => 'Typo', 'grants' => ['unicorns.view']])->assertStatus(422)->assertJsonPath('issues.0.path', 'grants.0');
        // Something that isn't text where a grant should be is a mistake to report, not a crash.
        $this->postJson('/api/_nevela/roles', ['name' => 'Odd', 'grants' => [['products.view'], 7]])->assertStatus(422);

        $this->patchJson("/api/_nevela/roles/{$id}", ['grants' => ['products.*']])->assertOk()->assertJsonPath('permissions.0', 'products.create');
        $this->getJson('/api/_nevela/roles')->assertOk()->assertJsonCount(4, 'data')->assertJsonPath('data.0.isSystem', true);

        // Deleting a role people hold would quietly take its permissions from them.
        $holder = $this->user('Support');
        $this->deleteJson("/api/_nevela/roles/{$id}")->assertStatus(409)->assertJsonPath('code', 'IN_USE');
        Access::assign($holder, []);
        $this->deleteJson("/api/_nevela/roles/{$id}")->assertNoContent();
    }

    public function test_the_built_in_roles_keep_their_names_and_admin_keeps_everything(): void
    {
        Sanctum::actingAs($this->user('ADMIN'));
        $admin = $this->role('ADMIN');
        $editor = $this->role('EDITOR');

        $this->patchJson("/api/_nevela/roles/{$editor->id}", ['name' => 'Staff'])->assertStatus(409)->assertJsonPath('code', 'BUILT_IN');
        $this->patchJson("/api/_nevela/roles/{$admin->id}", ['grants' => ['products.*']])->assertStatus(409)->assertJsonPath('code', 'BUILT_IN');
        $this->deleteJson("/api/_nevela/roles/{$editor->id}")->assertStatus(409)->assertJsonPath('code', 'BUILT_IN');

        // Their grants and descriptions are the app's to change.
        $this->patchJson("/api/_nevela/roles/{$editor->id}", ['description' => 'Our staff.', 'grants' => ['products.*']])->assertOk()->assertJsonPath('description', 'Our staff.');
        $this->assertSame(['products.*'], $this->role('EDITOR')->grants);
    }

    public function test_editing_roles_is_not_a_way_to_take_more_than_you_hold(): void
    {
        $own = $this->makeRole('Role keeper', ['roles.*', 'products.view']);
        Sanctum::actingAs($this->user('Role keeper'));

        // Not by widening their own role, with a permission or with a pattern.
        $this->patchJson("/api/_nevela/roles/{$own->id}", ['grants' => ['roles.*', 'products.view', 'users.edit']])->assertForbidden()->assertJsonPath('beyond', ['users.edit']);
        $this->patchJson("/api/_nevela/roles/{$own->id}", ['grants' => ['*']])->assertForbidden();
        $this->patchJson("/api/_nevela/roles/{$own->id}", ['grants' => ['@resources.view']])->assertForbidden();
        $this->postJson('/api/_nevela/roles', ['name' => 'Back door', 'grants' => ['products.*']])->assertForbidden()->assertJsonPath('code', 'BEYOND_YOUR_OWN');
        // Not by reshaping a role that already allows more than they hold.
        $this->patchJson('/api/_nevela/roles/'.$this->role('EDITOR')->id, ['grants' => []])->assertForbidden();

        // Within what they hold, they can.
        $this->postJson('/api/_nevela/roles', ['name' => 'Window shopper', 'grants' => ['products.view']])->assertCreated()->assertJsonPath('withinYours', true);
        $this->patchJson("/api/_nevela/roles/{$own->id}", ['grants' => ['roles.*']])->assertOk();
    }

    public function test_a_permission_taken_from_a_role_stops_working_on_the_next_request(): void
    {
        $role = $this->makeRole('Catalogue', ['products.view']);
        $person = $this->user('Catalogue');
        Sanctum::actingAs($person);
        $this->getJson('/api/products')->assertOk();

        Sanctum::actingAs($this->user('ADMIN'));
        $this->patchJson("/api/_nevela/roles/{$role->id}", ['grants' => []])->assertOk();

        Sanctum::actingAs(User::find($person->id));
        $this->getJson('/api/products')->assertForbidden();
    }

    // --- accounts made outside the dashboard

    public function test_the_first_account_made_on_the_command_line_is_the_administrator(): void
    {
        $this->artisan('nevela:user', ['--name' => 'Admin', '--email' => 'admin@example.com', '--password' => 'password'])->assertSuccessful();
        $this->artisan('nevela:user', ['--name' => 'Next', '--email' => 'next@example.com', '--password' => 'password'])->assertSuccessful();
        $this->artisan('nevela:user', ['--name' => 'Third', '--email' => 'third@example.com', '--password' => 'password', '--role' => 'editor'])->assertSuccessful();
        $this->artisan('nevela:user', ['--name' => 'Fourth', '--email' => 'fourth@example.com', '--password' => 'password', '--role' => 'Wizard'])->assertFailed();

        $roles = fn (string $email) => Access::rolesOf(User::query()->where('email', $email)->firstOrFail())->pluck('name')->all();
        $this->assertSame(['ADMIN'], $roles('admin@example.com'));
        $this->assertSame(['USER'], $roles('next@example.com'));
        $this->assertSame(['EDITOR'], $roles('third@example.com'));
        $this->assertNull(User::query()->where('email', 'fourth@example.com')->first());

        // Making an account proves nothing about its address. Whoever runs the command can say they know it.
        $this->assertNull(User::query()->where('email', 'admin@example.com')->value('email_verified_at'));
        $this->artisan('nevela:user', ['--name' => 'Known', '--email' => 'known@example.com', '--password' => 'password', '--verified' => true])->assertSuccessful();
        $this->assertNotNull(User::query()->where('email', 'known@example.com')->value('email_verified_at'));
    }

    public function test_ten_sample_users_two_editors_and_eight_users(): void
    {
        $this->artisan('nevela:user', ['--sample' => true, '--password' => 'password'])->assertSuccessful();

        $this->assertSame(10, User::query()->count());
        $this->assertSame(2, DB::table('nevela_role_user')->where('role_id', $this->role('EDITOR')->id)->count());
        $this->assertSame(8, DB::table('nevela_role_user')->where('role_id', $this->role('USER')->id)->count());
        $this->assertSame(0, DB::table('nevela_role_user')->where('role_id', $this->role('ADMIN')->id)->count());
        $this->assertSame(1, User::query()->where('active', false)->count());
        $this->assertTrue(User::query()->get()->every(fn (User $user) => str_ends_with($user->email, '@example.com') && $user->email_verified_at === null), 'made-up addresses that nobody has proved');
        $this->assertSame('amara.okafor@example.com', SampleUsers::email('Amara Okafor'));

        // One of them can sign in, as an editor.
        $this->postJson('/api/auth/token', ['email' => 'amara.okafor@example.com', 'password' => 'password'])
            ->assertCreated()->assertJsonPath('user.roles', ['EDITOR']);

        // Run again, it adds nobody.
        $this->artisan('nevela:user', ['--sample' => true])->assertSuccessful();
        $this->assertSame(10, User::query()->count());
    }

    public function test_sample_users_are_never_made_in_production(): void
    {
        $this->app->detectEnvironment(fn () => 'production');

        $this->artisan('nevela:user', ['--sample' => true, '--password' => 'a-long-password'])->assertFailed();
        $this->assertSame([], SampleUsers::create('a-long-password'));
        $this->assertSame(0, User::query()->count());
    }

    public function test_an_email_differing_only_in_capitals_is_the_same_account(): void
    {
        $this->artisan('nevela:user', ['--name' => 'Ada', '--email' => 'Ada@Example.com', '--password' => 'password'])->assertSuccessful();
        $this->artisan('nevela:user', ['--name' => 'Ada again', '--email' => 'ADA@example.com', '--password' => 'password'])->assertFailed();

        $this->assertSame(['ada@example.com'], User::query()->pluck('email')->all());
    }

    public function test_someone_who_signs_up_starts_as_a_user(): void
    {
        config(['nevela.auth.registration' => true]);

        $this->postJson('/api/auth/register', ['name' => 'Ada', 'email' => 'ada@example.com', 'password' => 'a-long-password'])
            ->assertCreated()->assertJsonPath('user.roles', ['USER'])->assertJsonPath('user.permissions', []);
    }
}
