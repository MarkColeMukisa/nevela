---
title: "Field types"
description: "Every field type Nevela accepts, how it is stored, and how it is validated."
---

Fields are written as `name:type`, separated by commas:

```sh
nevela resource Product --fields="name:string, sku:string!, price:money, notes:text?"
```

## Suffixes

| Suffix | Meaning | Example |
|---|---|---|
| `?` | Optional. The column is nullable. | `notes:text?` |
| `!` | Unique. No two records share a value. | `sku:string!` |

Both can be combined: `code:string?!`.

`=` after the type gives a default, used when a create leaves the field out: `status:enum(pending|paid)=pending`, `quantity:int=1`, `active:boolean=true`.

## Types


| Type | Stored as | Validation |
|---|---|---|
| `string` | `string` | text, up to 255 characters |
| `text` | `text` | text, up to 65,535 characters |
| `richtext` | `longText` | formatted text, kept as cleaned HTML, up to 65,535 characters |
| `email` | `string` | a valid email address |
| `url` | `string` (2,048) | a valid URL |
| `tel` | `string` | text, up to 32 characters |
| `slug` | `string` | letters, numbers, dashes and underscores |
| `color` | `string` | a hex colour such as `#1a2b3c` |
| `int` | `integer` | a whole number |
| `float` | `double` | a number |
| `money` | `decimal(12, 2)` | a number |
| `percent` | `double` | a number from 0 to 100 |
| `rating` | `integer` | a whole number |
| `boolean` | `boolean` | true or false |
| `date` | `date` | a date as `YYYY-MM-DD` |
| `datetime` | `dateTime` | a date and time |
| `enum(a\|b\|c)` | `string`, indexed | one of the listed values |
| `belongsTo(Resource)` | a foreign key, indexed | the id of a record that exists |
| `image` | `string` (the file's key) | a picture uploaded to this field |
| `file(pdf\|image)` | `string` (the file's key) | a file of a listed kind, uploaded to this field |
| `file(pdf\|private)` | `string` (the file's key) | the same, [kept private](/guides/images/#private-files) |

The dashboard picks the input and the table column from the type.

## Rich text

`body:richtext` is text with formatting. The dashboard gives it an editor with bold, italic, strikethrough, links, two sizes of heading, bullet and numbered lists, quotes, undo and redo, and the value is stored as HTML.

Nothing that is sent is trusted. Laravel parses the HTML and writes it out again with only the tags and attributes on a list, whichever way it arrived: the form, the API, "Add several" or a CSV import.

```
<p onclick="x()">Hi<script>alert(1)</script></p>      is stored as      <p>Hi</p>
```

A tag that isn't on the list goes and its words stay. A script, a style sheet or a frame goes with what is in it. A link keeps its address and nothing else, and only an `http`, `https` or `mailto` address, or one on your own site (`/about`). Plain text, from a spreadsheet for example, becomes a paragraph.

The same cleaning is done when a record is read, so HTML that reached the table some other way is never sent out as it is. What the API returns is safe to put on a page.

| | |
|---|---|
| The list | `rich_text` in `config/nevela.php`. It matches the editor's toolbar. Add a tag only if you would let a stranger put it on your page. |
| Length | 65,535 characters unless you give one: `body:richtext(20000)`. It counts the HTML that is stored, tags included. |
| Empty | An editor that was opened and left counts as empty, so a required field is still required. |
| In a table | The first words, as plain text. |
| Not offered | Sorting, filtering, search, and a cell in "Add several", which says so when the field is required. |

In the descriptor it is a `text` field with `"format": "rich"`.

## Relations and files

`category:belongsTo(Category)` links a record to one of another resource. It is stored as `category_id` and called `categoryId` in the API. See [Relationships](/guides/relationships/).

### Coming from Grit or Flare

The spellings those two use are understood, so you can type what you know:

| You write | Nevela reads it as |
|---|---|
| `image:file:image` (Grit) | `image:image` |
| `image:file:[image]` (Flare) | `image:image` |
| `docs:file:[pdf, image]` | `docs:file(pdf\|image)` |
| `category:belongs_to:Category` | `category:belongsTo(Category)` |
| `status:enum:draft\|live` | `status:enum(draft\|live)` |

`image:image` takes a picture and optimises it as it arrives; `image:image(product)` names the profile it is optimised with. `manual:file(pdf|document)` takes other files and stores them as they are. Neither can be unique, sorted by or filtered on. See [Files and images](/guides/images/).

`integer`, `bool` and `decimal` are accepted as other spellings of `int`, `boolean` and `money`.

A `string` or `text` can have a length of its own: `excerpt:string(500)`, `body:text(100000)`. The column, the validation and the dashboard's form all use it. A `text` longer than 65,535 is stored as `longText`.

Every resource also has `id`, `createdAt` and `updatedAt`. You do not declare them, and those names are reserved. The `id` is a UUID unless the resource was made with `--id=int` or [adopted from a table](/guides/existing-app/) with integer ids; either way it is a string in the API.
