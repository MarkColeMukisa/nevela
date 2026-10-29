---
title: "Relationships"
description: "Link one resource to another with belongsTo, and what Nevela generates on both ends."
---

A `belongsTo` field links a record to one record of another resource: a product to its category, a task to its owner.

```sh
nevela resource Product --fields="name:string, category:belongsTo(Category)"
```

The resource it points at has to exist first. If it does not, nothing is written and you are told the command to create it.

When the children are part of the parent, like an order's items, make them its [line items](/guides/line-items/) instead: they are edited in the parent's form and saved, deleted and restored with it.

## How to write it

| You write | Field | Column | Points at |
|---|---|---|---|
| `category:belongsTo(Category)` | `categoryId` | `category_id` | Category |
| `category:belongsTo` | `categoryId` | `category_id` | Category, from the name |
| `owner:belongsTo(Member)` | `ownerId` | `owner_id` | Member |
| `category:belongsTo(Category)?` | `categoryId` | `category_id`, nullable | Category, or nothing |

The field's name always ends in `Id`, because an id is what it holds. `category` and `categoryId` mean the same field.

## What is generated

On the resource that has the field (Product):

- **Migration:** `category_id`, a foreign key to `categories`, indexed.
- **Validation:** the id has to be a category that exists.
- **Model:** `$product->category`.
- **Dashboard:** a picker that searches categories by name, the category's name in the table, and a link to it on the product's page.

On the resource it points at (Category):

- **Model:** `$category->products`.
- **Dashboard:** the category's page lists its products.
- **Deleting:** see below.

Both models are regenerated when the relation is added, inside their generated blocks. Relations you write yourself go outside the block and are never touched.

```php
$category->products()->where('active', true)->count();
Product::with('category')->get();
```

## Deleting

What happens to the children when the parent is deleted depends on whether the link is required.

| The field is | Deleting the parent |
|---|---|
| required: `category:belongsTo(Category)` | is refused while it has children. The API answers 409 with "8 products belong to this category. Move or delete them first." |
| optional: `category:belongsTo(Category)?` | is allowed. Its children stay, with the link cleared. |

## In the API

The field is an id in both directions:

```json
{ "name": "Smart Kettle", "categoryId": "01a10804-7b04-72d6-aabf-a2113b9b6bc5" }
```

Filter a list by it:

```
GET /api/products?filter[categoryId]=01a10804-7b04-72d6-aabf-a2113b9b6bc5
```

## More than one link to the same resource

A task with an owner and a reviewer, both members:

```sh
nevela resource Task --fields="title:string, owner:belongsTo(Member), reviewer:belongsTo(Member)?"
```

Member gets two relations, named so they do not collide: `tasks` for the first field and `tasksAsReviewer` for the second.

## Many-to-many

A student takes several courses, and a course has several students. The link between them is a resource of its own, with a `belongsTo` to each side, and usually something about the link itself: when the student enrolled, and how it is going.

```sh
nevela resource Enrolment --fields="student:belongsTo(Student), course:belongsTo(Course), status:enum(active|completed|dropped)=active" --unique=student,course
```

`--unique=student,course` says a student is enrolled in a course once. In the descriptor:

```json
"unique": [["studentId", "courseId"]]
```

- **The table** has a unique index on the two columns, so the database refuses a second one however it is made.
- **A create or a change** that would make a second is refused, on the first field of the set: "There is already an enrolment with this student and course." A change that sends only one of them is checked with the record's own value for the other. Either half on its own is fine: the student in another course, another student in this one.
- **The trash counts.** An enrolment deleted to the trash still holds its pair, as the index does, and saying so: "There is one with these in the trash. Restore it, or delete it for good to use them again."
- **Many at once** (the grid, an import) are kept apart from each other as well as from what is there: "The same as row 1."
- **The seeder** gives each new enrolment its own pair, and says so if there aren't enough students and courses to go round.

A set is two or more fields of any kind but text and files. Give `--unique` again for a second set. Added to a resource whose table is already made, `nevela generate` writes a migration for the index, which refuses to run while records already share their values, and says how many.

Each side gets its relation: a student's `enrolments()`, a course's `enrolments()`. For the courses a student takes, go through it in your own code:

```php
// app/Models/Student.php, outside the generated block
public function courses(): BelongsToMany
{
    return $this->belongsToMany(Course::class, 'enrolments')->wherePivotNull('deleted_at');
}
```

The resource can't be another's [lines](/guides/line-items/) yet: saving an order's lines changes several at once, and two swapping their products would clash halfway through.

## Seeding

`nevela seed Product` gives each product a category picked from the ones that exist. Seed the parent first; if there are none and the link is required, the command says so and stops.

## Not generated

- A many-to-many as one field on either side (`courses:belongsToMany(Course)`). Make the link a resource, as [above](#many-to-many).
- A relation added to a resource whose table already exists. The migration is written once, so add the column in a migration of your own: `$table->foreignUuid('category_id')->constrained('categories');`
