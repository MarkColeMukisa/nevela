---
title: "The resource descriptor"
description: "The JSON file per resource that everything else is generated from."
---

`nevela:resource` writes a JSON file per resource in `nevela/resources/`. This file is the single source: everything else is generated from it.

```json
{
    "name": "Product",
    "table": "products",
    "slug": "products",
    "label": "Product",
    "pluralLabel": "Products",
    "icon": "package",
    "group": "Catalogue",
    "fields": {
        "name": { "kind": "string" },
        "sku": { "kind": "string", "unique": true },
        "price": { "kind": "float", "format": "money" },
        "kind": { "kind": "enum", "options": ["stock", "digital"] },
        "notes": { "kind": "text", "required": false }
    }
}
```

| Key | Meaning |
|---|---|
| `name` | The PascalCase name. Model, controller and policy are named from it. |
| `table` | The database table. |
| `id` | What a record's id is: `"int"` for the numbered ids of `$table->id()`. Left out, ids are UUIDs. Set when the resource is made, with `--id=int` or by [adopting a table](/guides/existing-app/). |
| `adopted` | `true` for a table that was there before Nevela: no migration is written to create it. |
| `slug` | The URL segment: `/api/products` and `/dashboard/products`. |
| `label`, `pluralLabel` | What the dashboard calls one record and many. |
| `icon` | A [Lucide](https://lucide.dev) icon name for the sidebar, such as `users`, `building-2` or `graduation-cap`. The dashboard knows the ones in `apps/web/components/dashboard/resource-icon.tsx`; add another there, and an icon it doesn't know is a plain page. Optional. |
| `group` | The sidebar heading the resource sits under. Optional. |
| `titleField` | The field shown as a record's title. Defaults to the first string field. |
| `fields` | The fields, in the order they appear in forms and tables. |
| `publish` | The optional date-and-time field a record is published by: empty is a draft, a time still to come is scheduled. See [The blog](/guides/blog/#how-it-is-described). Optional. |
| `blog` | Where on the site the resource's public records are a blog (`"/blog"`). Written by `nevela blog`. Optional. |
| `public` | What of the resource anyone may read or create without signing in. Nothing, without it. See [A public site on your API](/guides/public-site/), and [Protecting a public form](/guides/protecting-forms/) for its `protect` and `confirm`. Optional. |
| `items` | The resource its lines are, such as `"OrderItem"`: edited in its form as a table and saved with it. That resource has a `belongsTo` pointing here. See [Line items](/guides/line-items/). Optional. |
| `actions` | What can be done to a record, or to the list, beyond create, edit and delete. See [Actions on a record](/guides/actions/). Optional. |

Each field has a `kind` (`string`, `text`, `int`, `float`, `boolean`, `date`, `datetime`, `enum`, `belongsTo` or `file`) and may have:

| Key | Meaning |
|---|---|
| `format` | For strings: `email`, `url`, `tel`, `slug`, `color`. For numbers: `money`, `percent`, `rating`. For text: `rich`, which is [rich text](/concepts/field-types/#rich-text). |
| `target` | For `belongsTo`: the resource it points at, `"Category"`. The field's name ends in `Id`. See [Relationships](/guides/relationships/). |
| `accept` | For a file: the kinds it takes, `["image"]` or `["pdf", "document"]`. See [Files and images](/guides/images/). |
| `profile` | For an image: the [profile](/guides/images/#profiles) it is optimised with, `"product"`. |
| `options` | The allowed values of an enum. |
| `optionLabels` | For an enum: what each value is called where people read it, `{ "asap": "As soon as possible" }`. See [What an enum's values are called](/concepts/field-types/#what-an-enums-values-are-called). |
| `currency` | For money: the ISO 4217 code it is in, `"UGX"`. The app's `NEVELA_CURRENCY` unless set. See [Money and its currency](/concepts/field-types/#money-and-its-currency). |
| `private` | For a file: `true` keeps it where only someone who may view the record can fetch it. See [private files](/guides/images/#private-files). |
| `maxLength` | For `string` and `text`: the most characters it holds, where that isn't the usual 255 or 65,535. |
| `required` | `false` makes the field optional. Defaults to `true`. |
| `unique` | `true` makes values unique. Defaults to `false`. |
| `from` | For a slug: the field it is made from when a create leaves it empty (`"title"`). It is never remade afterwards. For any other field: the field of a related record it is copied from, `"productId.price"`. See [Copied from a related record](/concepts/field-types/#copied-from-a-related-record). |
| `auto` | For a string: the prefix of the number Laravel gives each new record, `"INV"` for INV-0001. Makes it unique. See [Numbered by Laravel](/concepts/field-types/#numbered-by-laravel). |
| `default` | What the field is when a create leaves it out: `"pending"`, `0`, `false`. Also the column's default. For `string`, `text`, `int`, `float`, `boolean` and `enum`. |
| `label` | The label in the dashboard. Defaults to the field name in words. |
| `list` | Its column in the dashboard's table: `true` always on, `"hidden"` off until turned on in the Columns menu, `false` none. Left out, the first six columns are on, and long text and files start off. See [Which columns the table shows](/concepts/field-types/#which-columns-the-table-shows). |
