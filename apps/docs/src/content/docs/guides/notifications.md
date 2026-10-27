---
title: "Notifications"
description: "The bell in the dashboard and the activity log: what Nevela tells people about, who is told, who did what to which records, and how to send your own."
---

The bell at the top of the dashboard says what happened while nobody was looking: a form sent, an account made, a job that failed. Each person sees only what concerns them, and the number on the bell is how many they haven't read.

Every app has it. There is nothing to switch on: run `php nevela migrate` once after upgrading, for the table it keeps them in.

## What people are told

| What happened | Who is told |
|---|---|
| Someone created, deleted or restored records | Everyone else who may view that resource (`products.view`) |
| A visitor sent a resource's public form | Everyone who may view that resource (`enquiries.view`) |
| Someone confirmed their address on a form that asks for it | The same people. A form that confirms says nothing until the address is confirmed. |
| Someone made an account, by signing up or with Google, GitHub and the like | Everyone who may view users (`users.view`) |
| Someone closed their own account | Everyone who may restore it (`users.delete`) |
| Your password was changed or reset, two-step sign-in was turned on or off, a passkey was added or removed | You |
| An administrator changed your roles or set your password, or restored your account | You |
| A queued job failed for good | The administrators |
| The night's clear-out removed records from the trash for good | The administrators |

Nobody is told about what they did themselves. Changes to how you sign in are told to you whoever made them: one you didn't make is the one you need to see.

Several of a kind that arrive before they are read are one line with a count: "14 new enquiries", which opens the list rather than the last one. Once it is read, the next one starts a line of its own. A failed job is counted the same way, per kind of job, and records per person: deleting twenty products at once tells the others "Ada deleted 20 products", once. A change to a record isn't told to anyone, so fixing typos doesn't fill the bell; it is in the activity log.

Opening a notification marks it read and goes where it points. **Mark all read** does the rest. Read ones are kept for 90 days; unread ones twice as long.

## The activity log

What you did yourself isn't in your bell. It is in the activity log: who created, changed, deleted, restored or removed for good which records, everyone's changes and your own.

- **Recent activity**, on the dashboard's home page, shows the latest eight.
- **Activity**, under Manage in the sidebar, has all of it, newest first, by resource and by what was done.

The same thing done to many records by one person within two minutes is one line: deleting a selection, importing a file or adding several at once reads "You deleted 20 products", not twenty lines. Every way of changing a record is counted: the dashboard, an import, an action, and your own code, as long as someone is signed in. Seeding, the scheduler and visitors to the site leave no activity.

It is for those whose roles include **Activity** (`activity.view`, under Access on the Roles screen), and each sees only the resources they may view. Administrators have it. Rows are kept for 180 days.

## What an administrator sees about the app

Above the notifications, an administrator sees what is wrong with the app right now. These aren't read or kept: each is there while it is true, and goes once it isn't.

| | Shown |
|---|---|
| Migrations haven't been run | Always |
| A newer Nevela is out | Always, once the scheduler, `nevela status` or `nevela upgrade` has looked |
| Background jobs have waited more than 15 minutes (a `database` queue with no worker) | Always |
| The scheduler hasn't run in 15 minutes | In production |
| Mail goes to the log | In production |
| The cache keeps nothing between requests | In production |

They are the same checks as [`nevela deploy:check`](/reference/commands/#nevela-deploycheck), worked out at most every five minutes. The bell never asks Packagist for the newest release itself: the scheduler does that each night.

## Sending your own

Anything your code does can tell people. `Notices::toPermission()` tells everyone who may do something; `Notices::send()` tells the people you give it.

```php
use Nevela\Laravel\Notices\Notice;
use Nevela\Laravel\Notices\Notices;

// Everyone who may see orders.
Notices::toPermission('orders.view', new Notice(
    "Order {$order->number} was paid",
    body: "{$order->total} from {$order->customer_name}",
    url: "/dashboard/orders/{$order->id}",
));

// One person, or several.
Notices::send($order->owner, new Notice('Your order has shipped', tone: 'warning'));

// The administrators.
Notices::toAdmins(new Notice('The nightly export failed', tone: 'warning'));
```

| Argument | |
|---|---|
| `title` | What happened, in a few words. |
| `body` | A line more, when the title isn't enough. |
| `url` | Where it is in the dashboard. |
| `tone` | `info`, or `warning` for something that needs doing. A warning colours the bell. |
| `kind` | What it is about, for your own code that reads them: `order.paid`. |
| `group`, `many`, `manyUrl` | Make several one line while unread. See below. |

To count them the way Nevela counts forms, give them a `group`, the title to use once there are several, and where several should lead:

```php
Notices::toPermission('orders.view', new Notice(
    "New order from {$order->customer_name}",
    url: "/dashboard/orders/{$order->id}",
    group: 'orders.new',
    many: fn (int $count) => "{$count} new orders",
    manyUrl: '/dashboard/orders',
));
```

`toPermission()` takes a third argument, the person who did it, who is then not told. Telling never fails the work that caused it: a problem is reported to your log and passed over. At most 500 people are told of any one thing.

## Over the API

| Request | What it does | Success |
|---|---|---|
| `GET /_nevela/notifications` | The signed-in person's latest 30, newest first, how many are unread, and for an administrator what is wrong with the app | `200 { items, unread, conditions }` |
| `POST /_nevela/notifications/read` | Mark one read (`{ "id": "…" }`), or all of them (no body) | `200 { read }` |
| `GET /_nevela/activity` | The activity log, newest first. Takes `resource` (`Product`), `action` (`created`, `updated`, `deleted`, `restored`, `purged`), `user`, `page` and `perPage`. Needs `activity.view`. | `200 { data, meta }` |

The dashboard asks again every minute while it is open in view, when you come back to its tab, and each time the bell is opened.
