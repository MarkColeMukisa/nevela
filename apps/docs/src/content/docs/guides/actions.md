---
title: "Actions on a record"
description: "Buttons beyond Edit and Delete: accept an application, send an announcement. Declared in the descriptor, written in one class, with a permission of their own."
---

Create, edit and delete are not everything an app does to its records. An application gets accepted. A list of subscribers gets an announcement. An action is one of those: you name it in the descriptor and write what it does in one class. Nevela gives it a route, a permission, a button, a confirmation, a form for what it asks, and a message when it is done.

## Declaring one

Add an `actions` section to the resource's descriptor, `nevela/resources/internship-application.json`:

```json
"actions": {
    "accept": {
        "label": "Accept",
        "icon": "check",
        "on": "record",
        "confirm": "Send the acceptance letter to this applicant?",
        "when": { "acceptedAt": null }
    }
}
```

Then:

```sh
nevela generate
```

That writes `app/Nevela/Actions/InternshipApplication/Accept.php`, once, and the button is on every application's page and in its row's menu. There is nothing else to wire.

| Key | Meaning |
|---|---|
| the name (`accept`) | camelCase. It is in the address, and its class is named from it. |
| `label` | What the button says. Defaults to the name in words. |
| `icon` | A [Lucide](https://lucide.dev) icon name, one of those in `apps/web/components/dashboard/resource-action.tsx` (`check`, `send`, `archive`, `mail` and others). Add another there. Optional. |
| `on` | `record`: a button on a record's page and in its row menu. `collection`: a button beside New, for the list as a whole. Defaults to `record`. |
| `confirm` | A question asked first, in the dialog Delete uses. Optional. |
| `when` | Field values a record must have for the action to apply: one value, or a list it may be any of (`{ "status": ["pending", "accepted"] }`). The button is hidden on a record that doesn't match, and Laravel refuses it there too. Optional, and for `record` actions only. |
| `set` | What it does, when that is only to give fields values: `{ "status": "accepted" }`. Nevela does it, and no class is written. See [Moving a status on](#moving-a-status-on). |
| `fields` | What it asks for before it runs. See [Asking for something](#asking-for-something). |
| `many` | `true` lets a `record` action run on the rows selected in the table as well. |

## Writing what it does

The class is yours. It is written once and never touched again.

```php
namespace App\Nevela\Actions\InternshipApplication;

use App\Mail\AcceptanceLetter;
use App\Models\InternshipApplication;
use Illuminate\Support\Facades\Mail;

class Accept
{
    public function handle(InternshipApplication $internshipApplication, array $input): ?string
    {
        $internshipApplication->update(['accepted_at' => now()]);
        Mail::to($internshipApplication->email)->queue(new AcceptanceLetter($internshipApplication));

        return "Accepted {$internshipApplication->name}. Their letter is on its way.";
    }
}
```

What it returns is the message the person sees. Return nothing and they are told it is done.

By the time `handle()` runs, Nevela has checked that the person holds the action's permission, that they may see the record, that the record matches `when`, and that what was filled in is valid.

It runs inside a database transaction. If it throws, what it changed in the database is undone, and the person is told that it didn't work and that nothing was changed. While the Laravel app is in debug mode they are also told why. To refuse with a message of your own, use `abort(409, 'This applicant has withdrawn.')`.

Until you have written it, the class says so: pressing the button answers "Accept does nothing yet", with the file to write it in.

## Moving a status on

Many actions do one thing: move a record to its next step. Accept an order, mark it ready, cancel it. For those, say the values in `set`, and there is nothing to write:

```json
"actions": {
    "accept": { "label": "Accept", "when": { "status": "pending" }, "set": { "status": "accepted" } },
    "markReady": { "label": "Ready", "when": { "status": "accepted" }, "set": { "status": "ready" } },
    "callOff": { "label": "Cancel with a reason", "when": { "status": ["pending", "accepted"] }, "set": { "status": "cancelled" }, "fields": { "reason": { "kind": "text" } } }
}
```

Each value must be one the field can have: an option of an enum, and not nothing for a required field. `nevela generate` says which, if not. If you write the action's class anyway, it runs after the values are set, for what else should happen (a text message, say).

## A record's history

Every record action that is done is kept, as a step in the record's history: what was done, by whom, when, what it changed and what was filled in for it. Unlike the [activity log](/guides/notifications/#the-activity-log), nothing is merged: three steps are three rows. The record's page in the dashboard shows them, and so does the mobile app, to whoever may see the record. For an order that belongs to a customer, that is the customer too.

When the resource has an [owner](/guides/policies/#which-records-each-person-sees), the person a record belongs to is told of each step through the bell, unless they took it themselves: **Your order JM-0014 is now Ready**, with the reason as the notice's text when the action asked for one. A step they take themselves, such as a customer cancelling, is told instead to those who may edit the resource: **Order JM-0014 is now Cancelled**, by Amara Okafor.

```
GET /api/_nevela/history/{slug}/{id}
```

answers `{ "data": [ { "action", "label", "user": { "id", "name" }, "changes": { "status": { "from", "to" } }, "input", "at" } ] }`, oldest first, and 404 for a record the person may not see.

## Records fixed once made

A placed order shouldn't be edited after the fact, by anyone. Make the resource with `--fixed`, or put `"fixed": true` in its descriptor, and once a record is made:

- Nobody signed in edits or deletes it: not staff, not the administrator. The dashboard and the mobile app offer no Edit and no Delete, and Laravel answers 409 to anything that tries, from wherever.
- Its [lines](/guides/line-items/) can't be added to, changed or taken away.
- It moves on only through its actions, each a step in its history.
- Someone who may not edit the resource (a customer) can't choose, when they make one, the values its actions set. A new order of theirs is pending, whatever the request said.

What is still allowed: finishing a record in the request that made it (its lines, and a total worked out from them in `itemsSaved()`), an action, and anything run where nobody is signed in: seeders, the console, queued jobs and the scheduler. Removing a test order is done there: `php nevela tinker`, then `App\Models\Order::find($id)->forceDelete()`.

On a fixed resource the **Edit** permission no longer edits anything once a record is made. With an [owner](/guides/policies/#which-records-each-person-sees) it still says who runs the place: those who hold it see every record.

## Asking for something

An action can ask for values first. They are filled in a sheet that opens from the button, with the same inputs a form has:

```json
"actions": {
    "announce": {
        "label": "Send announcement",
        "icon": "megaphone",
        "on": "collection",
        "fields": {
            "subject": { "kind": "string" },
            "message": { "kind": "text" }
        }
    }
}
```

```php
namespace App\Nevela\Actions\NewsletterSubscription;

class Announce
{
    public function handle(array $input): ?string
    {
        $subscribers = NewsletterSubscription::query()->pluck('email');
        foreach ($subscribers as $email) {
            Mail::to($email)->queue(new Announcement($input['subject'], $input['message']));
        }

        return "Queued for {$subscribers->count()} subscribers.";
    }
}
```

A field is written as in a resource: a `kind` (`string`, `text`, `int`, `float`, `boolean`, `date`, `datetime` or `enum`), and optionally `format`, `options`, `optionLabels`, `currency`, `required`, `label` and `maxLength`. A money field (`"format": "money"`) on the sheet shows its currency, or the app's, as on a resource. They are validated by the rules a resource's field of that kind has, and a problem is shown on the field in the sheet. `$input` holds what passed.

An action on the collection has no record, so its `handle()` takes `$input` alone.

## Who may

Each action is a permission of its own, named from the table and the action: `internship_applications.accept`. It is on the [Roles screen](/guides/policies/) under the resource, beside Create, View, Edit and Delete.

An administrator has it. Nobody else does until it is given to their role by name. In particular, a role with everything for a resource, or for all resources (as `EDITOR` has), does **not** have its actions: being allowed to edit applications is not being allowed to send acceptance letters.

Without the permission the button isn't shown and the address answers 403.

In your own code it is checked like any other: `$user->can('internship_applications.accept')`.

## Confirming it's you

Some actions matter enough to ask whoever does them to confirm it's them, every time: a transfer, a refund, closing a loan. Mark them `"sensitive": true`:

```json
"actions": {
  "refund": { "label": "Refund", "set": { "status": "refunded" }, "when": { "status": "paid" }, "sensitive": true }
}
```

The dashboard and the phone then ask for the password (or a code emailed to them, the authenticator app's code, or a passkey on the web) before it runs, and once for each time it runs. The API asks, not the button, so a script can't skip it: see [Confirming it's you again](/guides/authentication/#confirming-its-you-again). The person is asked only once the action is allowed and what they filled in is valid.

## On a selection

With `"many": true`, a record action is also offered in the bar that appears when rows are ticked. It runs for each selected record it applies to and passes over the rest, and says how many of each. It is one transaction: if it fails for one, none are changed.

## Over the API

| | |
|---|---|
| `POST /api/{slug}/{id}/_actions/{action}` | On one record. Body: `{ "input": { … } }`. Answers `{ "message", "record" }`. |
| `POST /api/{slug}/_actions/{action}` | On the collection: `{ "input": { … } }`. Or a `many` record action on a selection: `{ "ids": [ … ], "input": { … } }`, which answers `{ "message", "done", "skipped" }`. |

| Status | When |
|---|---|
| 403 | The person doesn't hold the action's permission. |
| 404 | No such action, or no such record, or one they may not see. |
| 409 | The record doesn't match `when`. `code` is `NOT_APPLICABLE`. Also an edit or a deletion of a [fixed](#records-fixed-once-made) record, by any address. |
| 422 | Something in `input` is not valid. `issues` says what, by field. |
| 428 | A [sensitive](#confirming-its-you) action, not yet confirmed. `code` is `CONFIRMATION_REQUIRED`, with a `challenge` to confirm. |
| 500 | The class threw. Nothing was changed. |
