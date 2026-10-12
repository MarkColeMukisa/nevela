---
title: "A public site on your API"
description: "Let anyone read some records and send some forms without signing in: the descriptor's public section, publicQuery, uploads from a form, and caching in the web app."
---

Everything a resource has is behind sign-in, until its descriptor says otherwise. A `public` section opens part of it to anyone: published posts to read, a contact form to send.

Nothing is open without the section, and nothing beyond what it names.

[The blog](/guides/blog/) a new app comes with is a worked example of the reading half: a resource, its section, and the pages that show it.

```json
"public": {
    "read":   { "by": "slug", "fields": ["title", "slug", "excerpt", "body", "publishedAt"] },
    "create": { "fields": ["name", "email", "subject", "message"], "throttle": "10,1" }
}
```

Run `nevela generate` after adding or changing it.

| Key | Meaning |
|---|---|
| `read.fields` | The fields anyone may see. Nothing else is ever in a public answer. |
| `read.by` | The unique field one record is fetched by: with `"slug"`, `/public/posts/my-first-post`. Without it, the id. |
| `read.throttle` | Requests a minute for each visitor, as `"how many,minutes"`. Default `"60,1"`. |
| `create.fields` | The fields a visitor may send. Anything else is refused. |
| `create.throttle` | The same, for the form. Default `"10,1"`. |
| `middleware` | More middleware for these routes, by name: your own spam check. |

A resource can have `read`, `create` or both. With `read` alone there is no way to write to it.

## The routes

They are under `/api/public`, with no sign-in:

| | |
|---|---|
| `GET /api/public/posts` | The list: `{ data, meta }`, as the signed-in list. |
| `GET /api/public/posts/{id}` | One record, by id or by the `by` field. |
| `POST /api/public/contact-messages` | Create one. |
| `PUT /api/public/_nevela/uploads/{Resource}/{field}` | A file for a create. See [A file with a form](#a-file-with-a-form). |

Only what a section names exists. `nevela generate` writes them to `routes/nevela-public.php`, which you can read to see exactly what is open.

## Which records are public

That is the model's to say, and it says so in a scope:

```php
// app/Models/Post.php, outside the generated block
public function scopePublicQuery(Builder $query): void
{
    $query->whereNotNull('published_at')->where('published_at', '<=', now());
}
```

The list and the single record both go through it. A record it doesn't let through is a 404, by id and by slug, and isn't counted in the total. A record in [the trash](/guides/trash/) is never public.

A model generated with `public.read` already in its descriptor gets the scope written for it, **letting nothing through**. So does a model with no scope at all: adding `public.read` to an existing resource opens nothing until you write the scope, and `nevela generate` reminds you. A table can't be exposed by accident.

## Reading

Sorting, filtering, search and paging work as on the signed-in list, over `read.fields` only:

```
GET /api/public/posts?sort=-publishedAt&perPage=10&filter[category]=Events&q=open
```

A field that isn't listed can't be sorted by, filtered on or searched, and a request that tries is answered 400. That matters: without it a hidden field could be worked out by sorting on it.

A record is its `id` and the listed fields. Not `createdAt`, unless you list a field of your own for it.

## Creating

```
POST /api/public/contact-messages
{ "name": "Amara", "email": "amara@example.com", "subject": "Training", "message": "When is the next intake?" }
```

The rules are the resource's own, the ones the dashboard's form is checked by, so they are written once. A key that isn't in `create.fields` is refused as unknown. Rich text is cleaned.

The answer is 201 with the record's `read.fields`, or with nothing where the resource has no `read`.

Anything the app does when a record is saved (an email, a notification) belongs on the model, where it runs however the record was made:

```php
protected static function booted(): void
{
    static::created(fn (ContactMessage $message) => Mail::to(config('mail.from.address'))->queue(new NewContactMessage($message)));
}
```

### Fields the form leaves out

A visitor doesn't choose a message's `status`. Such a field needs something to be, which is a **default**:

```json
"status":   { "kind": "enum", "options": ["new", "read"], "default": "new" },
"category": { "kind": "enum", "options": ["consulting", "training", "other"], "default": "other" }
```

or `status:enum(new|read)=new` after `--fields`. The default is used whenever a create leaves the field out, public or not, and is the column's default too. A required field that is neither in `create.fields` nor has a default is refused when the descriptor is read, since no public create could ever succeed.

## A file with a form

A form with a file sends it first, to the upload route of a file field that `create.fields` lists:

```
PUT /api/public/_nevela/uploads/InternshipApplication/cv?name=cv.pdf
Content-Type: application/pdf
(the file)
```

It answers with a `key`. The form then sends that key as the field's value. The field's own types and size limit apply.

A key from a public upload can be used **once**, in a public create for that resource, **within an hour**. Files uploaded and never used (a form that was started and left) are removed by `nevela trash`, which the scheduler runs each night.

Make the field [private](/guides/images/#private-files) for anything personal: `cv:file(pdf|private)`. A visitor can then upload it and nobody can read it back but someone signed in who may view the record.

## Throttling

Each resource's reading, its form and its upload are counted separately, for each visitor. Past the limit the answer is 429.

Through the web app every request reaches Laravel from the web app's server. So that visitors are counted apart, the web app passes on each visitor's address with the secret the two apps share (`NEVELA_PROXY_SECRET`, set in both when the app was created). Without the secret set in production, all visitors are counted as one.

The address it passes on is the one the proxy in front of the web app saw, the last entry of `X-Forwarded-For`, and not the first, which is whatever the request came with: a visitor who could choose the address they are counted by would have a fresh allowance with every request. That is right for a web app behind one proxy, which is what a host or a single nginx gives you. Set `NEVELA_TRUSTED_PROXIES` in the web app's environment when it is otherwise:

| | |
|---|---|
| `1` (the default) | One proxy in front of the web app. |
| `2`, `3` | That many: a CDN in front of a load balancer is two. |
| `0` | The web app is reached directly, with nothing in front. No address can be trusted then, and all visitors are counted together. |

## In the web app

### A page anyone can open

`laravelPublic()` in `lib/laravel.ts` reads what is public. It sends no token and nothing about the visitor, so its answer is cached and shared:

```tsx
import { resourceTag } from "@/lib/cache";
import { laravelPublic } from "@/lib/laravel";

export default async function BlogPage() {
  const { body } = await laravelPublic("posts?sort=-publishedAt", { tags: [resourceTag("Post")] });
  const posts = (body as { data: { id: string; title: string; slug: string }[] }).data;
  return <ul>{posts.map((post) => <li key={post.id}><a href={`/blog/${post.slug}`}>{post.title}</a></li>)}</ul>;
}
```

| Option | Meaning |
|---|---|
| `tags` | What makes the answer stale. `resourceTag("Post")` is revalidated by the dashboard whenever a post is created, changed, deleted or restored, so a post published there is on the page at once. |
| `revalidate` | How long an answer may be reused, in seconds. Default 300. `false` keeps it until a tag is revalidated. |

The body of a rich text field is HTML that Laravel has cleaned, and can be put on the page as it is.

### A form

Post to the web app's own address, which passes it on:

```ts
const response = await fetch("/api/public/contact-messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, email, subject, message }),
});
if (response.status === 422) {
  const { issues } = await response.json(); // [{ path: "email", message: "…" }]
}
```

and a file, before it, to `/api/public/_nevela/uploads/<Resource>/<field>?name=cv.pdf` with `PUT`.

Those two, and reading under `/api/public`, are the only things the web app lets through without a session.
