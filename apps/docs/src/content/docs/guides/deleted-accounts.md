---
title: "Deleted accounts"
description: "A closed or deleted account is kept and can be restored, and its email can't sign up again: the Deleted accounts page, closing your own account, and blocked emails."
---

An account that is closed isn't erased. It is kept, signed out everywhere and unable to sign in, until someone restores it or removes it for good. And an email that had an account doesn't get a fresh one by signing up again.

That second part is the point of it. Someone who closes their account to start over, to get a second free trial or to leave a bill behind, finds that their email is already known.

## Two ways an account is closed

- **Its owner closes it.** At the foot of **Account → Profile** there is **Close account**. It asks for the password, and says what closing means before doing it.
- **Someone deletes it** from the **Users** screen. Delete now closes the account where it used to remove it, and the confirmation says so.

Either way the account is signed out on every device, can't sign in by any method (the answer is `ACCOUNT_CLOSED`), is sent no sign-in links, codes or password resets, and leaves the Users screen. Its roles count for nothing while it is closed.

The only administrator can't close their own account: nobody would be left to restore it. They make someone else an administrator first.

## The Deleted accounts page

**Deleted accounts**, under Manage in the sidebar, for anyone whose roles include `users.delete`. It lists each closed account with its roles, when it was closed, and by whom: "by themselves", or the name of whoever deleted it.

| | |
|---|---|
| **Restore** | The account is open again exactly as it was: the same password, roles, passkeys and second step. Its owner is told by email. |
| **Remove for good** | The account, its roles and its sign-in methods are erased. It asks first. The email stays blocked. |

The rule from the Users screen holds here too: you restore and remove only accounts that may do no more than you. Someone who manages users and isn't an administrator can't restore an administrator.

## An email can't sign up again

While an account is closed, and after it is removed for good, signing up with its email is refused:

| The email's account | Sign-up answers |
|---|---|
| is closed, and kept | `ACCOUNT_CLOSED`: "An account with this email was closed. Ask an administrator to restore it." |
| was removed for good | `EMAIL_BLOCKED`: "This email can't be used for a new account. Ask an administrator." |

The same goes for an administrator adding a user with that email: the form says to restore the account, or to allow the email again.

Emails are compared as the mailbox they reach, so another spelling of the same address is the same address:

- capitals don't matter: `Mark@Example.com` is `mark@example.com`;
- a `+tag` is ignored: `mark+new@example.com` is `mark@example.com`;
- at Gmail, dots are ignored and `googlemail.com` is `gmail.com`: `m.ark@gmail.com` is `mark@gmail.com`.

### Allowing an email again

Once an account is removed for good, its email appears under **Emails that can't sign up**, on the same page. **Allow again** takes it off the list, and that address can have an account once more.

### What is kept of a removed account

Not the address. Two things, in the `nevela_blocked_emails` table:

- a **fingerprint**: an HMAC-SHA256 of the address, keyed with your `APP_KEY`. It answers "is this the same address?" and nothing else. The address can't be read back from it, and it is useless to anyone who has only the database.
- a **hint**, such as `m•••@gmail.com`: the first letter and the domain, so that whoever is asked to allow an email again can tell which one it is.

Because the fingerprint is keyed with `APP_KEY`, it depends on that key. Rotate the key the way Laravel provides for, with the old one kept in `APP_PREVIOUS_KEYS`, and blocked emails stay blocked: fingerprints made under an earlier key are still recognised. Replace the key and drop the old one, and they match nothing; those emails are then free to sign up again.

If your users have a right to have their data erased, **Remove for good** is the erasure: what remains can't identify them to anyone but you, and only when they come back with the same address. Whether you may keep even that is for you to judge under the rules you work to. **Allow again** deletes it.

## Switching "Close account" off

To leave closing accounts to the people who may delete users, [publish the config](/guides/configuration/) and set:

```php
'auth' => [
    'close_account' => false,
],
```

Then run `nevela generate`, so the dashboard stops showing the section. Laravel refuses the request either way.

## In your Laravel code

```php
use Nevela\Laravel\Access\ClosedAccounts;

ClosedAccounts::isClosed($user);          // true while the account is closed
ClosedAccounts::open()->count();          // a query of the users who are not closed
ClosedAccounts::closed()->get();          // only the closed ones

ClosedAccounts::close($user, $by);        // close it; $by is whoever is doing it
ClosedAccounts::restore($user);
ClosedAccounts::purge($user);             // remove for good, and keep its email blocked
ClosedAccounts::standing($email);         // "closed", "blocked", or null
```

A closed account is a row in your `users` table with `closed_at` set. `User::query()` still returns it, so a count or a list of your own that should show only people who can sign in starts from `ClosedAccounts::open()`, or adds `->whereNull('closed_at')`.

To close an account from your own code, for example when a subscription is cancelled, call `ClosedAccounts::close($user)`.

## Upgrading an app from before 0.7.0

```sh
nevela upgrade
nevela migrate
```

The migration adds `closed_at` and `closed_by` to your users table and creates `nevela_blocked_emails`. Until it has run, the app works as it did: deleting a user removes them, the Delete confirmation says "This can't be undone", and the Deleted accounts page says what to run.

One thing to check afterwards: code of your own that lists or counts users, as above.

## Over the API

All under `/api`. Closing your own account takes a token and your password, and no permission. Everything else here takes a token whose roles include `users.delete`.

| | |
|---|---|
| `POST /auth/close` | Close your own account. Takes `password`. |
| `DELETE /_nevela/users/{id}` | Close someone's account |
| `GET /_nevela/deleted-accounts` | The closed accounts: `q`, `page`, `perPage`. Each has `closedAt`, `closedBy` (`self` or `admin`) and `closedByName`. `blocked` is how many emails are blocked. |
| `POST /_nevela/deleted-accounts/{id}/restore` | Restore one |
| `DELETE /_nevela/deleted-accounts/{id}` | Remove one for good |
| `GET /_nevela/blocked-emails` | The blocked emails: `id`, `hint`, `blockedAt` |
| `DELETE /_nevela/blocked-emails/{id}` | Allow one again |

`GET /_nevela/users` has `meta.keepsDeleted`: whether deleting a user closes the account or, in an app that hasn't migrated, removes it.
