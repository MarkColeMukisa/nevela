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
| `slug(title)` | `string` | the same, made from the title when left empty (`post-title`, then `post-title-2`) |
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

## Which columns the table shows

A table starts with its first six columns, and the date each record was created. The other columns are in the **Columns** menu above the table, to turn on. Long text, a `string` longer than 255 characters, and a file that isn't a picture start off whatever their place, because a paragraph in a row makes the table too wide to read. A cell never grows past a set width: a value too long for it ends in "…", and the whole of it shows when you point at it.

A field's `list` in the [descriptor](/concepts/descriptor/) decides for it:

| `list` | The column |
|---|---|
| `true` | Always on, even past the sixth or for long text. |
| `"hidden"` | In the Columns menu, and off until someone turns it on. |
| `false` | Not in the table at all. |

```json
"notes": { "kind": "text", "required": false, "list": true }
```

Run `nevela generate` after changing it. What someone turns on or off goes in the page's address (`?columns=name,email`), so a link to it opens with the same columns.

## What an enum's values are called

A value is what is stored, validated and sent over the API, so it is a short key: `asap`, `quarter`. What people read can be words, given after `=`:

```sh
nevela resource ProjectRequest --fields="name:string, timeline:enum(asap=As soon as possible|month=Within a month|quarter=In 1 to 3 months|flexible)"
```

or in the descriptor:

```json
"timeline": {
    "kind": "enum",
    "options": ["asap", "month", "quarter", "flexible"],
    "optionLabels": { "asap": "As soon as possible", "month": "Within a month", "quarter": "In 1 to 3 months" }
}
```

The dashboard uses the words everywhere it shows the value: the table, its filters, the form, a record's page, the stat cards and the charts. A value with no label is made readable from the key: `flexible` reads "Flexible", `on_hold` "On hold". A label for a value that isn't one of `options` is refused when the descriptor is read.

Your own code can say the same words, for an email or a PDF, without keeping a copy of them:

```php
$request->optionLabel('timeline');   // "In 1 to 3 months"
```

Every generated model with an enum field has it. The descriptor has it too: `Nevela::resource('ProjectRequest')->fields['timeline']->optionLabel('quarter')`.

## Money and its currency

A money field is shown in a currency when one is set: for the whole app in `apps/api/.env`, or on the field.

```sh
NEVELA_CURRENCY=UGX
```

```json
"quoteAmount": { "kind": "float", "format": "money", "currency": "UGX" }
```

A field's own wins. It is written with the currency's own decimals, so `UGX 4,500,000` and `$4,500,000.00`, and the input shows the code beside the number. A currency with no decimals, such as UGX, takes whole numbers only. The code is ISO 4217's, in capitals: anything else is refused. With neither set, money looks as it always has.

Run `nevela generate` after changing `NEVELA_CURRENCY`.

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
