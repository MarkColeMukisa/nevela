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
| `tel` | `string` | a phone number of any country, up to 32 characters |
| `tel(UG)` | `string` | [a number of that country](#phone-numbers), kept as `+256772123456` |
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
| `files(image)` | `json` (the files' keys) | [several files](/guides/images/#several-files-in-one-field) uploaded to this field, up to 20 |

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

## Numbered by Laravel

An order number, an invoice number or a ticket number is given by the app, one after another:

```sh
nevela resource Invoice --fields="number:auto(INV), customer:string, total:money"
```

The first invoice is INV-0001, the next INV-0002, and on past INV-9999 to INV-10000. Grit's way of writing it, `number:string:auto:INV`, means the same, and in the descriptor it is `"auto": "INV"` on a string field. The prefix is letters and digits, up to ten, starting with a letter.

- **Left empty, it is given the next one** when the record is made: in the form, over the API, by an import or by your own code (`Invoice::create([...])`). The form says so in the field. One typed in is kept.
- **It is unique**, and a number in the trash isn't given again.
- **The next is one more than the highest** with that prefix. Two records made at the same instant can be given the same number; the column is unique, so the second is refused rather than saved with it, and can be sent again.
- Seeding gives the rows INV-0001, INV-0002 and so on, from where an empty table starts.

## Copied from a related record

An order item's price is its product's. Rather than type it, copy it:

```sh
nevela resource OrderItem --fields="product:belongsTo(Product), quantity:int, price:money(product.price)"
```

`(product.price)` is a relation of the resource and a field of the record it points at, of the same type. In the descriptor it is `"from": "productId.price"`.

- **The copy is made when the record is made, and again when it is pointed at another** (the item is changed to another product). Otherwise it is kept: when a product's price changes, the orders already made keep the price they were sold at.
- **It isn't typed.** The form shows it and doesn't ask for it, and in an order's [line items](/guides/line-items/) the price is in the row as soon as the product is picked. What a request sends for it is left out.
- It is copied however the record is saved: the dashboard, the API, an import, or your own code.
- A copy can't be unique, or a file or a relation.

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

## A field that only sometimes applies

A billing cycle belongs to a recurring project and means nothing on a one-off one. `if` after a field says which records it is for:

```sh
nevela resource Project --fields="name:string, kind:enum(one_off|recurring), cycle:enum(monthly|annually) if kind == recurring, amount:money"
```

| Where it applies (a recurring project) | Everywhere else (a one-off) |
|---|---|
| The form shows it, marked required. | The form doesn't show it. |
| Left empty, it is refused: "Needed when the kind is Recurring." | It is empty. Sent anyway, it is not kept. |

A project changed from recurring to one-off loses its cycle, and one changed the other way needs one sent with the change. A change that sends neither keeps what the record has. Laravel holds to this however a record arrives (the form, the API, "Add several", a CSV import, a public form), and the seeder gives a cycle only to the recurring projects it makes. The column is nullable, since most rows may have nothing in it.

| | |
|---|---|
| Several values | `rate:money if kind == recurring\|retainer` |
| A yes/no field | `terms:text if billed == true` |
| Optional where it applies | `discount:percent? if kind == recurring` is never needed, but still empty on a one-off |
| What it depends on | An enum or a yes/no field of the same resource, which doesn't itself depend on another |
| Not for | A relation (make it optional instead), a numbered or made field, or one with a default |

In the descriptor:

```json
"cycle": { "kind": "enum", "options": ["monthly", "annually"], "when": { "kind": "recurring" } }
```

## Phone numbers

`phone:tel` takes a phone number of any country. The dashboard's input has a picker for the country's code, starting at the viewer's own, and sends the number with it: `+256772123456`.

`phone:tel(UG)` takes Ugandan numbers only. The code is fixed at +256 in the dashboard, and Laravel checks the number whichever way it arrives (the form, the API, "Add several", a CSV import, a public form or an action). It is read the ways people write one there and kept the one way:

| Sent | Kept |
|---|---|
| `0772 123456` | `+256772123456` |
| `772123456` | `+256772123456` |
| `+256 772 123 456` | `+256772123456` |
| `(0414) 123-456` | `+256414123456` |
| `+254 712 345678` | refused: "Enter a Ugandan number, such as 0772 123456 or +256 772 123456." |

So `0772 123456` and `+256772123456` are the same number to a unique field too, and the seeder makes numbers that read as Ugandan ones.

The countries it knows are `UG`, `KE`, `TZ` and `RW`. In the descriptor:

```json
"phone": { "kind": "string", "format": "tel", "country": "UG" }
```

`phone:tel[UG]` and Grit's `phone:tel:UG` mean the same. A number in the brackets is a length, as for a `string`: `phone:tel(20)`.

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
| `gallery:files[image]` (Grit) | `gallery:files(image)` |
| `category:belongs_to:Category` | `category:belongsTo(Category)` |
| `status:enum:draft\|live` | `status:enum(draft\|live)` |
| `phone:tel[UG]`, `phone:tel:UG` | `phone:tel(UG)` |

`image:image` takes a picture and optimises it as it arrives; `image:image(product)` names the profile it is optimised with. `manual:file(pdf|document)` takes other files and stores them as they are. Neither can be unique, sorted by or filtered on. See [Files and images](/guides/images/).

`integer`, `bool` and `decimal` are accepted as other spellings of `int`, `boolean` and `money`.

A `string` or `text` can have a length of its own: `excerpt:string(500)`, `body:text(100000)`. The column, the validation and the dashboard's form all use it. A `text` longer than 65,535 is stored as `longText`.

Every resource also has `id`, `createdAt` and `updatedAt`. You do not declare them, and those names are reserved. The `id` is a UUID unless the resource was made with `--id=int` or [adopted from a table](/guides/existing-app/) with integer ids; either way it is a string in the API.
