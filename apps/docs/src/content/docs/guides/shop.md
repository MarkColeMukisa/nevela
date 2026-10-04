---
title: "Build a shop"
description: "Categories and products, linked together, each with an image that is optimised when it is uploaded."
---

Two resources, one relationship between them, and images that are resized and compressed as they arrive. Six commands from an empty app to a dashboard you can add products in.

## 1. Create the app

```sh
pnpm create nevela my-shop
cd my-shop
```

## 2. Categories

```sh
php nevela resource Category --fields="name:string, slug:slug!, image:image?" --icon=tags --seed=8
```

`image:image?` is an optional picture. `--seed=8` creates the table and fills it with eight categories, most of them with a placeholder image, so there is something to look at.

## 3. Products

```sh
php nevela resource Product --fields="name:string, sku:string!, price:money, image:image(product)?, category:belongsTo(Category), active:boolean" --icon=package --seed=40
```

Two fields here are new:

- `category:belongsTo(Category)` links each product to a category. It is stored as `category_id`, and the API calls it `categoryId`.
- `image:image(product)` is a picture optimised with the `product` profile: it fits inside 1000×1000, with a 300×300 thumbnail and a 600×600 card made alongside.

A product has to point at a category, so categories are created first. Asking for a relation to a resource that does not exist yet is refused, with the command to create it.

## 4. Run it

```sh
php nevela dev
```

Sign in at the address it prints. In the dashboard:

- **Products** shows each product's thumbnail and the name of its category.
- **New product** has a picker that searches categories, and a box to drop an image on.
- A **category's page** lists the products in it.
- Deleting a category that still has products is refused: "8 products belong to this category. Move or delete them first."

## What happened to the image

Drop a 4000×3000 photo from a phone on the product form and this is stored:

| File | Size | What it is for |
|---|---|---|
| `…-kettle.webp` | 1000×750, about 85 KB | the product page |
| `…-kettle.card.webp` | 600×450, about 48 KB | a grid of products |
| `…-kettle.thumb.webp` | 300×300, about 22 KB | a table row, a cart line |
| the original, 1.2 MB | kept privately | optimising again later with other settings |

The photo was also turned the right way up, and the location it was taken at was removed with the rest of its metadata. [Files and images](/guides/images/) has the details and how to change the sizes.

## The API for a storefront

The same API the dashboard uses serves a storefront. A product comes back with its image's addresses and dimensions beside the key:

```json
{
  "id": "01a10804-8b62-7051-9637-61f4872386fa",
  "name": "Smart Kettle",
  "price": 49.5,
  "categoryId": "01a10804-7b04-72d6-aabf-a2113b9b6bc5",
  "image": "products/image/2026/10/778e5b3c-…-kettle.webp",
  "imageFile": {
    "url": "https://api.example.com/api/_nevela/files/products/image/2026/10/778e5b3c-…-kettle.webp",
    "width": 1000,
    "height": 750,
    "renditions": {
      "thumb": { "url": "…-kettle.thumb.webp", "width": 300, "height": 300 },
      "card": { "url": "…-kettle.card.webp", "width": 600, "height": 450 }
    }
  }
}
```

Products in one category:

```
GET /api/products?filter[categoryId]=01a10804-7b04-72d6-aabf-a2113b9b6bc5&sort=name
```

In a page, use the dimensions so nothing moves when the picture arrives, and let the browser pick a size:

```tsx
<img
  src={product.imageFile.renditions.card.url}
  srcSet={`${product.imageFile.renditions.card.url} 600w, ${product.imageFile.url} 1000w`}
  sizes="(max-width: 640px) 50vw, 300px"
  width={product.imageFile.renditions.card.width}
  height={product.imageFile.renditions.card.height}
  alt={product.name}
  loading="lazy"
/>
```

Every route needs a signed-in user by default. To let a storefront read products without one, add your own public routes in `routes/nevela.php`, or change who may read in the [policy](/guides/policies/).

## Next

- [Relationships](/guides/relationships/): optional links, deleting, and the Eloquent methods you get.
- [Files and images](/guides/images/): profiles, formats, limits and where files are kept.
