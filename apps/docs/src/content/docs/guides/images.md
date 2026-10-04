---
title: "Files and images"
description: "Upload fields, and how images are resized, compressed and given smaller renditions as they arrive."
---

Two field types store files.

| You write | It takes | Example |
|---|---|---|
| `image:image` | pictures, optimised on upload | a product photo, a logo |
| `manual:file(pdf)` | the kinds you list, stored as they are | a PDF, a spreadsheet |

```sh
php nevela resource Product --fields="name:string, image:image, manual:file(pdf|document)?"
```

The kinds a `file` field can list are `image`, `pdf`, `video`, `audio`, `text`, `csv`, `document`, `spreadsheet`, `archive` and `any`. `file` on its own means `any`.

## What happens to an image

The approach is [Grit](https://github.com/MUKE-coder/grit)'s: optimise once, when the file arrives, and store the result.

1. **It is checked.** The contents have to be an image, whatever the file is called. One that would decode to more than 50 million pixels is refused from its header, before memory is spent on it.
2. **It is turned the right way up.** A phone stores a portrait photo sideways with a note saying so. The note is applied, then removed with the rest of the metadata, including where the photo was taken.
3. **It is scaled down to fit** the profile's box, 1600×1600 by default. Never up.
4. **The format is chosen from the pixels.** Transparency is kept (lossless WebP). Everything else becomes WebP at quality 82, about a quarter smaller than a JPEG that looks the same. A transparent logo cannot end up as a JPEG with a black box behind it. A diagram or screenshot uploaded as a PNG stays a PNG when that is the smaller file.
5. **Renditions are made**: by default a 400×400 `thumb`.
6. **The original is kept**, privately, so the image can be optimised again with other settings.

A 4000×3000 photo of 1.2 MB comes out as 85 KB, plus a 22 KB thumbnail.

GIFs are stored as they are: decoding one keeps only its first frame. If an image cannot be optimised, it is stored as it came and marked `optimised: false`, because losing a file is worse than storing a large one.

## Profiles

A profile says how big, which format and which renditions. They are in `config/nevela.php`, under `uploads.profiles`. Publish the file to change them:

```sh
php nevela artisan vendor:publish --tag=nevela-config
```

Name a profile on the field: `image:image(product)`. A field that names none uses `default`.

| Profile | Stored image | Renditions |
|---|---|---|
| `default` | fits 1600×1600 | `thumb` 400×400, cropped |
| `product` | fits 1000×1000 | `thumb` 300×300, cropped · `card` fits 600×600 |
| `avatar` | 400×400, cropped | `thumb` 80×80, cropped · original not kept |
| `cover` | fits 2400×1200 | `thumb` 600×300, cropped |

A profile only says what differs from `default`:

```php
'profiles' => [
    'banner' => [
        'max' => [1920, 600, 'crop'],
        'quality' => 78,
        'renditions' => ['mobile' => [800, 400, 'crop']],
    ],
],
```

| Key | Meaning |
|---|---|
| `max` | `[width, height]` the image fits inside. Add `'crop'` to fill the box exactly. |
| `quality` | 1 to 100. Default 82. |
| `format` | `auto`, `webp`, `jpeg`, `png` or `avif`. Default `auto`. |
| `renditions` | Extra sizes, by name. Same shape as `max`. |
| `keep_original` | Keep the untouched upload. Default true. |
| `on_error` | `store_original` (default) or `reject`. |
| `max_pixels` | Refuse anything larger. Default 50,000,000. |

## Using an image

A record stores the file's key. The API sends the details beside it, as `<field>File`:

```json
"image": "products/image/2026/10/778e5b3c-…-kettle.webp",
"imageFile": {
  "key": "products/image/2026/10/778e5b3c-…-kettle.webp",
  "url": "https://api.example.com/api/_nevela/files/products/image/2026/10/778e5b3c-…-kettle.webp",
  "name": "kettle.jpg",
  "mime": "image/webp",
  "size": 87040,
  "width": 1000,
  "height": 750,
  "optimised": true,
  "renditions": {
    "thumb": { "url": "…-kettle.thumb.webp", "width": 300, "height": 300, "size": 22118 },
    "card": { "url": "…-kettle.card.webp", "width": 600, "height": 450, "size": 48530 }
  }
}
```

A rendition's address is the image's address with the rendition's name before the extension, so it can be built from the key alone: `kettle.webp` → `kettle.thumb.webp`. Asking for a rendition that was never made gets the image itself.

Set `width` and `height` on the `<img>` from these numbers. The browser then reserves the space, and the page does not jump when the picture arrives.

## Uploading

The dashboard's form does this for you. From your own code, send the file as the body of a `PUT`:

```sh
curl -X PUT "http://127.0.0.1:8000/api/_nevela/uploads/Product/image?name=kettle.jpg" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: image/jpeg" \
  --data-binary @kettle.jpg
```

The answer is the same object as `imageFile` above. Put its `key` in the record:

```sh
curl -X POST http://127.0.0.1:8000/api/products -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name": "Kettle", "image": "products/image/2026/10/778e5b3c-…-kettle.webp"}'
```

A record only accepts a key that was uploaded to that same field, so a record cannot be pointed at another resource's file.

Uploading takes the permission to create records of that resource (the policy's `create`). Being allowed to read them is not enough.

## Where files are kept

| Setting | Default | What it is |
|---|---|---|
| `uploads.disk` | `public` | The disk from `config/filesystems.php` files are stored on. Use `s3` in production if the app runs on more than one server. |
| `uploads.originals_disk` | `local` | Where untouched originals go. Never served. |
| `uploads.url` | none | If a CDN or your web server serves the disk, its address. The API's links then point there. |
| `uploads.max_bytes` | 10 MB | The largest file a field takes. |
| `uploads.memory` | `512M` | Memory allowed while an image is optimised. |

Files are handed out by `GET /api/_nevela/files/<key>`, so nothing needs linking or publishing for it to work. Only files uploaded through Nevela are served this way, whatever else is on the disk. The response may be cached for good: a key is never reused.

:::caution
A file's key is unguessable, but anyone who has it can fetch the file. Do not use these fields for documents that must stay private.
:::

## Requirements

Optimising needs PHP's GD extension, which most PHP installations have (Laravel Herd does). Check with `php -m`. Without it, images are stored as uploaded. WebP and the removal of orientation notes also need GD's WebP support and the `exif` extension; without them Nevela falls back to JPEG or PNG and leaves orientation alone.

## Not done yet

- Files are not deleted when their record is, or when a field is given a new file. They stay on the disk.
- Uploads are capped at the size PHP can hold in memory. For large video, upload to your storage directly and store the address in a `url` field.
