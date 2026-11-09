# FuelBot flavor images: spec for the content team

These are the pictures of each drink on the machine's menu and details
screens. You upload an image to the tenant's AWS S3 bucket, and the image's
URL goes into the flavor's `image_url` in the machine's catalog (the config
API). The machine downloads it by itself.

## The file

| | Requirement |
|---|---|
| Format | **PNG or WebP with a transparent background** (JPEG is accepted, but it has no transparency, so it shows as a rectangle) |
| Framing | The product (bottle, tub or cup) **tightly framed**: no empty margin around it. The machine trims leftover transparent borders anyway, but a tight crop is what you'll see |
| Size | **600 × 800 px portrait** recommended |
| Limits | At most **2 MB** and at most **2048 px** on either side. A bigger file is refused |
| Content | One product, upright, no text or price on the image (the screen adds the name and price) |

## Naming: a new file name for every change

The machine keeps every image it has downloaded, **by file name**, and never
downloads a name it already has. So:

- **Every changed image needs a new file name.** Add a date and a letter or a
  version: `prymor_guava-20260926a.png`.
- **Never overwrite a file in place.** Machines that already have that name
  will keep showing the old picture, forever.

### Example: updating the guava picture

1. The current image is
   `https://fuelbot-assets.s3.ap-south-1.amazonaws.com/machine-042/flavors/prymor_guava-20260926a.png`.
2. Upload the new picture as **`prymor_guava-20261014a.png`** (today's date).
   A second change on the same day would be `prymor_guava-20261014b.png`.
3. Change guava's `image_url` in the catalog to the new URL.
4. Leave the old file in S3 until every machine has restarted (it does no
   harm there).

**The mistake to avoid:** uploading the new picture as
`prymor_guava-20260926a.png` again (or as a fixed name like
`prymor_guava.png`). The URL doesn't change, so no machine will ever
download the new picture.

## What the machine does

- **When a change appears:** the machine reads its catalog when it starts, so
  a new `image_url` is picked up at the next restart of the machine. It then
  downloads the image in the background. Until the download finishes, it
  keeps showing the previous picture of that drink: there's never a blank.
- **If the file is bad** (missing, not an image, too large, or unreachable):
  the machine keeps showing the previous picture (or its built-in one),
  tries again every 10 minutes, and reports an `image_download_failed` event
  to the backend with the drink, the file name and the reason (`http_404`,
  `not_an_image`, `too_large_bytes`, `too_large_px`, `empty_image`,
  `unreachable`, `timeout`).
- **Old files on the machine** are deleted automatically once no drink uses
  them any more.
