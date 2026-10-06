---
title: "Users, roles and permissions"
description: "Who can sign in and what each of them may do: users, roles and permissions, managed from the dashboard and enforced by Laravel."
---

Every app has a **Users** screen and a **Roles** screen. A role is a set of permissions, a person holds one or more roles, and Laravel checks the permission on every request. If you have used Grit, this is the same model, with the same names.

## Permissions

A permission is `feature.action`.

| Part | What it is |
|---|---|
| feature | A resource's table (`products`), one of the built-in ones (`users`, `roles`), or one you add |
| action | `create`, `view`, `edit` or `delete` |

So a `Product` resource brings `products.create`, `products.view`, `products.edit` and `products.delete`. Nothing has to be registered: a resource's permissions exist as soon as the resource does.

## The roles an app starts with

| Role | What it allows |
|---|---|
| `ADMIN` | Everything, including whatever is added later. |
| `EDITOR` | Every action on every resource, and seeing who the users are. It manages neither users nor roles. |
| `USER` | Nothing beyond the person's own account. |

These three are built in: you can change what `EDITOR` and `USER` allow and their descriptions, and you can't rename or delete them. `ADMIN` always allows everything. Make as many roles of your own as you like on the Roles screen.

Someone with several roles may do everything any of them allows.

## The people an app starts with

A new app has an administrator and ten sample users, all in your local database only:

| | |
|---|---|
| `admin@example.com` | `ADMIN` |
| `amara.okafor@example.com`, `daniel.kim@example.com` | `EDITOR` |
| seven more, such as `sofia.martinez@example.com` | `USER` |
| `noah.williams@example.com` | `USER`, switched off |

They all sign in with the password `password`. Sign in as one of each to see what a role changes: an editor has the resources and a read-only list of users, a user has only their own account, and the switched-off account is turned away.

They are made by the installer, never by a migration, so they don't follow the app to a server. Delete them before real use. To create an app without them:

```sh
nevela new my-app --no-sample-users
```

To add them to an app that doesn't have them:

```sh
nevela user --sample
```

## Managing users

**Users** in the sidebar, for anyone whose roles include `users.view`.

- **Add someone** with a name, an email, a password and their roles. They can sign in straight away.
- **Change their roles**, their name, their email, or set a new password. A new password signs them out everywhere and they are told by email.
- **Switch an account off.** It is kept, signed out of every device, and can't sign in until it is switched on again.
- **Sign someone out everywhere** without changing anything else.
- **Delete** an account, with its roles, its passkeys and its second step.

From the command line, `nevela user` still creates an account. The first one in an app is its `ADMIN`. After that it asks which role, or takes one:

```sh
nevela user --name="Ada Okafor" --email=ada@example.com --role=EDITOR
```

## Managing roles

**Roles** in the sidebar, for anyone whose roles include `roles.view`. A role's page is a grid of every permission there is: a row for each thing and a column for each action.

Two switches save ticking boxes:

- **Everything here, and whatever is added later**, on a section. A role with this on the Resources section covers a resource you generate next month without being edited. `EDITOR` has it.
- The **All** box at the end of a row, for every action on one thing.

A change to a role applies from each person's next request. Nobody has to sign in again.

A role that people hold can't be deleted: give them another first.

## Three rules that can't be switched off

Being allowed to manage users or roles is never a way to get more than you were given.

1. **You hand out only what you hold.** You can give someone a role, or put a permission in a role, only if your own roles already allow everything it does.
2. **Only an administrator changes an administrator's account.** Someone with `users.edit` can't reset an administrator's password, change their email, or delete them.
3. **The last administrator stays.** The only remaining administrator can't be deleted, switched off, or given a lesser role, by anyone. And you can't switch off or delete your own account.

Laravel enforces these. The dashboard disables what would be refused, and the API refuses it whatever a client sends.

## In your Laravel code

A generated policy asks for the matching permission:

```php
public function update(User $user, Product $product): bool
{
    return $user->can('products.edit');
}
```

The policy file is yours. Add conditions of your own beside the permission:

```php
public function update(User $user, Product $product): bool
{
    return $user->can('products.edit') && $product->user_id === $user->id;
}
```

Anything shaped like a permission works wherever Laravel checks an ability: `$user->can('products.view')`, `Gate::authorize('users.edit')`, `@can('products.delete')`, and `->middleware('can:reports.view')` on a route.

### Permissions of your own

Add them in `config/nevela.php`. They appear on the Roles screen under **App**:

```php
'permissions' => [
    'reports' => ['name' => 'Reports', 'actions' => ['view']],
],
```

```php
Route::get('reports', ReportController::class)->middleware('can:reports.view');
```

### Granting by pattern

A role's grants can be patterns. The Roles screen writes the first two for you; all of them work through the API.

| Grant | Covers |
|---|---|
| `*` | Everything |
| `@resources.*` | Every action on every resource, including ones added later |
| `@resources.view` | Viewing every resource |
| `products.*` | Every action on products |
| `*.view` | Viewing everything, users and roles included |

## What the dashboard does with them

The dashboard hides what the signed-in person can't use: a resource they can't view isn't in the sidebar, and the buttons for adding, editing and deleting appear only with the matching permission. Opening a page by its address without the permission sends them back to the dashboard with a note saying why.

This is only for showing and hiding. Laravel decides every request again for itself.

`policies/index.ts` is still there for hiding more by role name. It can hide, and never show:

```ts
export const policies: Record<string, Policy> = {
  Product: { read: ["ADMIN", "EDITOR"], delete: ["ADMIN"] },
};
```

## People who sign up

With [sign-up open](/guides/authentication/#letting-people-sign-up), a new account gets the `USER` role, which allows nothing beyond their own account. To start them with another, set `auth.default_role` in `config/nevela.php` to its name.

## Upgrading an app from before 0.5.0

Until 0.5.0 every signed-in user could do everything. Upgrading keeps it that way until you decide otherwise:

- **Every existing user becomes an `ADMIN`** when the migration runs (`nevela migrate`). Nobody loses access. Give people narrower roles from the Users screen when you are ready.
- **Your policies are not touched.** They are your files, and they still say `return true`. To put a resource under permissions, change its policy to ask for them, as in the example above. Until you do, the dashboard hides that resource from people without the permission, and the API still allows it to any signed-in user.

Between upgrading and running the migration, everyone can still do everything, and the Users and Roles screens say the migration is needed.

## Over the API

| | |
|---|---|
| `GET /api/auth/me` | The signed-in user, with `roles`, `permissions` (patterns resolved) and `isAdmin` |
| `GET /api/_nevela/users` | List: `q`, `role`, `status`, `page`, `perPage` |
| `POST /api/_nevela/users` | Create: `name`, `email`, `password`, `roles` (ids), `active` |
| `PATCH /api/_nevela/users/{id}` | Any of the same fields |
| `DELETE /api/_nevela/users/{id}` | Delete |
| `DELETE /api/_nevela/users/{id}/sessions` | Sign them out everywhere |
| `GET /api/_nevela/roles` | Every role, with what its grants come to and how many people hold it |
| `POST /api/_nevela/roles` | Create: `name`, `description`, `grants` |
| `PATCH /api/_nevela/roles/{id}` | Any of the same fields |
| `DELETE /api/_nevela/roles/{id}` | Delete, when nobody holds it |
| `GET /api/_nevela/permissions` | Every permission there is, in the sections the Roles screen shows |

A refusal says why, with a `code`: `BEYOND_YOUR_OWN`, `ADMIN_ONLY`, `LAST_ADMIN`, `SELF`, `BUILT_IN` or `IN_USE`.
