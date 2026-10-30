---
title: "The blog"
description: "Every new app has a blog: posts written in the dashboard, /blog on the site, a sitemap and a feed. How it is put together, and how to give one to an app that has none."
---

A new app has a blog. Posts are written under **Blog → Posts** in the dashboard, a heading of its own below the resources you make, and read at `/blog` on the site. It starts with a post for each of Nevela's tutorials and a welcome, and the newest three are on the home page too.

Nothing about it is special. It is a resource like any other, using what every resource can have: [rich text](/concepts/field-types/#rich-text), an [optimised image](/guides/images/), a slug, a date it is published on and a [public side](/guides/public-site/). The pages that show it were written once into your app and are yours.

`nevela new my-app --no-blog` creates an app without it.

In an app created before 0.27, Posts sits among your own resources. To give it its heading, add `"group": "Blog"` to `apps/api/nevela/resources/post.json` and run `nevela generate`.

## What you get

| | |
|---|---|
| The resource | `Post`: title, slug, excerpt, body, image and the date it is published. |
| In the dashboard | Posts, under **Blog** in the sidebar, with a Published / Draft / Scheduled badge, a filter on it, and Publish and Unpublish. |
| `/blog` | Published posts, newest first, nine to a page. |
| `/blog/<slug>` | One post, with a title, description and picture for search engines and shared links. |
| `/blog/feed.xml` | An RSS feed of the latest fifty. |
| `/sitemap.xml` | The site's pages and every published post. |
| The site's header | A Blog link. |
| The home page | The newest three posts, under "From the blog", with a link to the rest. Nothing while none is published. |

## The posts it starts with

A new app's blog has a post for each of [Nevela's tutorials](/tutorials/), as Grit's new apps have posts about Grit: its cover, what it builds, how long it takes, and a link to it on these docs. A welcome post says where posts are written and how publishing works. They are the tutorials there were when your version of Nevela came out, and an app made with a later version has the ones written since.

They are made only in development, never on a live site, and they are yours to delete: open **Posts** in the dashboard, select them and delete them. Your own posts then take their place on the blog and on the home page.

## Writing a post

Open **Posts** and press New. Only the title and the body are needed.

**The slug** is the end of the post's address: `/blog/opening-day`. Leave it empty and it is made from the title, as you type. If another post already has that slug, this one gets `opening-day-2`. Once a post has a slug, changing its title leaves the slug alone: an address people have linked to must not move. To change it, type a new one.

**The excerpt** is the sentence or two shown in the list and to search engines. Without one, the start of the body is used.

## Publishing

A post is a draft until it is published, and a draft is not on the site.

| | |
|---|---|
| **Publish** | Puts it on the site now. On the post's page and in its row's menu. |
| **Unpublish** | Takes it off again and keeps it as a draft. |
| A date still to come | It is **scheduled**, and appears by itself when that time arrives. Set the date in the form. |

Publishing is an edit, so it takes the permission to edit posts (`posts.edit`).

A post published in the dashboard is on the site at once. A scheduled one appears within a minute of its time: nobody saves anything at that moment, so the site finds out the next time it asks, which it does at most once a minute.

## Making it yours

The pages were written into your app, once, and are not touched again.

| File | What it is |
|---|---|
| `apps/web/lib/blog.ts` | The blog's title and description, how many posts are on a page, and the one place that knows which resource the posts are and what its fields are called. |
| `apps/web/app/blog/page.tsx` | The list. |
| `apps/web/app/blog/[slug]/page.tsx` | One post. |
| `apps/web/app/blog/feed.xml/route.ts` | The feed. |
| `apps/web/app/sitemap.ts` | The sitemap. Add your own pages to it. |
| `apps/web/components/marketing/latest-posts.tsx` | The newest three on the home page. `nevela blog` puts it in `app/page.tsx` where the template marks the place, `{/* nevela:latest-posts */}`; on a home page without that line, it says how to add `<LatestPosts />` yourself. |

Set `NEXT_PUBLIC_SITE_URL` in the web app's environment to the address visitors use (`https://example.com`). The sitemap, the feed and the links a shared post carries are made from it.

To add a field to posts, an author for example, add it to `nevela/resources/post.json`, list it under `public.read.fields` if the site should show it, run `nevela generate`, and read it in `lib/blog.ts`.

## How it is described

This is the whole of what makes it a blog, in `nevela/resources/post.json`:

```json
{
    "name": "Post",
    "publish": "publishedAt",
    "blog": "/blog",
    "fields": {
        "title": { "kind": "string" },
        "slug": { "kind": "string", "format": "slug", "unique": true, "from": "title" },
        "excerpt": { "kind": "string", "maxLength": 500, "required": false },
        "body": { "kind": "text", "format": "rich" },
        "image": { "kind": "file", "accept": ["image"], "profile": "cover", "required": false },
        "publishedAt": { "kind": "datetime", "required": false }
    },
    "public": { "read": { "by": "slug", "fields": ["title", "slug", "excerpt", "body", "image", "publishedAt"] } }
}
```

Three of those keys work for any resource, not only for posts:

| Key | What it does |
|---|---|
| `"from": "title"` on a slug | The slug is made from that field when a create leaves it empty, and never remade. After `--fields` it is `slug:slug(title)!`. |
| `"publish": "publishedAt"` | Names the optional date-and-time field a record is published by. The dashboard shows the badge, the filter and the two buttons, and the model's `publicQuery` scope is written to let through the records whose time has come. |
| `"blog": "/blog"` | Says the resource's public records are the site's blog, which is what puts the link in the header. `nevela blog` writes it. |

Over the API, a list of a published resource can be narrowed by which of the three a record is: `GET /api/posts?filter[publishedAt]=draft`, or `published`, or `scheduled`.

## An app that has no blog

```sh
nevela blog
```

adds the Post resource, its table and the pages to an app created with `--no-blog` or before 0.9. `--sample` adds the sample posts too, a welcome and one per tutorial; it is for development and is refused in production.

## An app whose posts are in a table of its own

If the app came with a posts table, [adopt it](/guides/existing-app/) and give it a public side first. Then write only the pages, saying which of its fields is which:

```sh
nevela blog --resource=Post --title=title --body=body --excerpt=excerpt --image=thumbnail --published=published_at
```

| Option | Meaning |
|---|---|
| `--resource=` | The resource whose public records are the posts. |
| `--title=`, `--body=` | Its fields for those. Default: `title` and `body`. |
| `--excerpt=`, `--image=` | Its fields for those, if it has them. |
| `--published=` | Its field for when a post was published. Default: the one the resource is published by. |

A field can be named as the column is (`published_at`) or as the field is (`publishedAt`).

It refuses, and says why, when the resource can't be read publicly, when its `public.read` has no `by` (a post's address is made from a unique field), or when a field you named isn't among `public.read.fields`.

Two things about a table that was there first:

- **A body that isn't a rich text field is shown as plain text.** An adopted `body` column is a `text` field, and whatever HTML is in it has never been cleaned, so the page won't put it on show as HTML. Make the field rich text in the descriptor (`"format": "rich"`), run `nevela generate`, and set `BODY_IS_HTML` to `true` in `lib/blog.ts`: Laravel then cleans it every time it is read.
- **A picture that is a path, not an upload**, is looked for on the Laravel app's public disk (`/storage/<path>`). Change `picture()` in `lib/blog.ts` if yours are somewhere else.

Which records are public is still the model's `publicQuery` scope. For a resource with `"publish"` in its descriptor a newly generated model has the right one; a model that was already there needs it written:

```php
public function scopePublicQuery(Builder $query): void
{
    $query->whereNotNull('published_at')->where('published_at', '<=', now());
}
```
