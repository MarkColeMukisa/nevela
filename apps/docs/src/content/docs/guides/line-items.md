---
title: "Line items"
description: "An order and its items, an invoice and its lines: edited as a table inside the form, saved together, and deleted and restored together."
---

Some records are made of lines: an order of the products in it, an invoice of what it charges for, a delivery of the parcels in it. The lines are a resource of their own, and you edit them in the order's form, as a table, and save them with it.

## Make one

```sh
nevela resource Order --fields="number:auto(ORD), customer:string, status:enum(pending|paid|shipped), total:money?" --items="OrderItem: product:belongsTo(Product), quantity:int, price:money(product.price)"
```

`number:auto(ORD)` [numbers each order](/concepts/field-types/#numbered-by-laravel), ORD-0001 and on, and `price:money(product.price)` [copies each item's price](/concepts/field-types/#copied-from-a-related-record) from its product, so it isn't typed. Both are optional: `number:string!` and `price:money` are typed in instead.

`--items` is the lines' name, a colon, and their fields. That makes two resources:

- **Order**, whose descriptor says `"items": "OrderItem"`.
- **OrderItem**, with the fields you gave and one more, `order:belongsTo(Order)`, which points each line at its order. If one of your fields already points at Order, that one is used.

Grit's way of writing it works too: `--items="InvoiceItem:description:string,qty:int,unit_rate:money"`.

`--seed=10` makes ten orders and about thirty lines among them.

## What you get

**In the order's form**, below its fields (on the last step, when the form has several), a table with a row for each line. A product is picked as it is anywhere else. **Add order item** adds a row, and the cross at the end of a row removes it. A row left empty is ignored.

Each line is checked with OrderItem's own rules before anything is sent. A mistake is shown under its row, and nothing is saved until every line is right. The order and its lines are saved together, or not at all.

**On the order's page**, its lines in a table.

**In the sidebar**, Orders and not Order items. Lines are reached through their order, and so are left off the dashboard's home page too. Their pages and their API are still there, for a report or a script.

## Amounts and the total

When the lines have a quantity and a price, the form and the order's page show what each line comes to and the total:

- the quantity is a whole or decimal number called `quantity` or `qty`
- the price is the first [money](/concepts/field-types/#money-and-its-currency) field

These are worked out where they are shown, as you type. Nothing is stored.

### Storing the total

To keep the total on the order, so that the list can show and sort by it, give the model an `itemsSaved()` method. Nevela calls it after the lines are saved, inside the same transaction:

```php
// apps/api/app/Models/Order.php, outside the generated block

/** Called once its lines are saved: the order's total is what they come to. */
public function itemsSaved(): void
{
    $this->update(['total' => $this->orderItems()->get()->sum(fn (OrderItem $item) => $item->quantity * $item->price)]);
}
```

`orderItems()` is the relation Nevela wrote for the lines. Anything else that follows from the lines goes here too: stock, a tax line, a discount.

It is called when the order is saved with its lines: its form, or `items` sent with the order over the API. A line changed through its own API (`/api/order-items/{id}`) doesn't call it, so the order keeps its total until it is next saved. If something changes lines that way, save the order after it, or call `itemsSaved()` on it.

## Who may change them

The order's permissions. Whoever may edit an order may add, change and remove its lines, and whoever may create one may give it lines. OrderItem's own permissions (`order_items.view` and the rest) are for its own pages and API, which most people never need.

## Deleting

Deleting an order puts its lines in [the trash](/guides/trash/) with it. Restoring it brings them back, and removing it for good removes them too. The Trash page lists the order, not its lines.

A line removed in the form is removed for good. It was part of the order, not a record anyone will look for in the trash.

A product that is on an order can't be deleted while it is: the usual rule for a [required relation](/guides/relationships/#deleting).

## In the API

The lines travel with the order as `items`.

```http
POST /api/orders
{
  "number": "ORD-1042",
  "customer": "Amara Okafor",
  "status": "pending",
  "items": [
    { "productId": "019a…", "quantity": 2, "price": 49.5 },
    { "productId": "019b…", "quantity": 1, "price": 8 }
  ]
}
```

- **`GET /api/orders/{id}`** has `items`, in the order they were added. A list of orders leaves them out.
- **`POST`, `PUT` and `PATCH`** take `items`, the order's lines whole. A line sent with its `id` is changed. One without an id is added. A line of the order's that isn't in the list is removed. Each line is sent with all its fields.
- **Without `items`**, a `PATCH` leaves the lines as they are.
- **A line's `orderId`** is filled in by Laravel, so leave it out. A client that sends back what it was given isn't refused for it.
- **A mistake in a line** answers 422, with the line's place in the list in the path: `{ "path": "items.1.quantity", "message": "…" }`. Nothing is saved.
- **At most** `bulk_max` lines (500) at once.

## Giving lines to a resource you already have

1. Make the lines' resource, with a required relation to it: `nevela resource InvoiceLine --fields="description:string, qty:int, price:money, invoice:belongsTo(Invoice)"`.
2. Add `"items": "InvoiceLine"` to `apps/api/nevela/resources/invoice.json`.
3. Run `nevela generate`.

## An app that changed its form

The table of lines is part of the dashboard's form, `apps/web/components/dashboard/resource-form.tsx`. If you had changed that file, upgrading keeps your version, and the dashboard still builds, but forms show no lines until you bring in the new version. The upgrade leaves it in `apps/web/.nevela/incoming/<version>/` for you to compare. See [Updating and upgrading](/guides/updating/).

## Not done yet

- Lines inside lines.
- A file, an image or rich text in a line. A table has no room for an upload or an editor; such a field can be filled in on the line's own page.
- Moving a line up or down. Lines stay in the order they were added.
- A unique field in a line.
