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
| `icon` | A [Lucide](https://lucide.dev) icon name. Optional. |
| `on` | `record`: a button on a record's page and in its row menu. `collection`: a button beside New, for the list as a whole. Defaults to `record`. |
| `confirm` | A question asked first, in the dialog Delete uses. Optional. |
| `when` | Field values a record must have for the action to apply. The button is hidden on a record that doesn't match, and Laravel refuses it there too. Optional, and for `record` actions only. |
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
| 409 | The record doesn't match `when`. `code` is `NOT_APPLICABLE`. |
| 422 | Something in `input` is not valid. `issues` says what, by field. |
| 500 | The class threw. Nothing was changed. |
