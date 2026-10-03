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
| `slug` | The URL segment: `/api/products` and `/dashboard/products`. |
| `label`, `pluralLabel` | What the dashboard calls one record and many. |
| `icon` | A [Lucide](https://lucide.dev) icon name for the sidebar. Optional. |
| `group` | The sidebar heading the resource sits under. Optional. |
| `titleField` | The field shown as a record's title. Defaults to the first string field. |
| `fields` | The fields, in the order they appear in forms and tables. |

Each field has a `kind` (`string`, `text`, `int`, `float`, `boolean`, `date`, `datetime` or `enum`) and may have:

| Key | Meaning |
|---|---|
| `format` | For strings: `email`, `url`, `tel`, `slug`, `color`. For numbers: `money`, `percent`, `rating`. |
| `options` | The allowed values of an enum. |
| `required` | `false` makes the field optional. Defaults to `true`. |
| `unique` | `true` makes values unique. Defaults to `false`. |
| `label` | The label in the dashboard. Defaults to the field name in words. |
