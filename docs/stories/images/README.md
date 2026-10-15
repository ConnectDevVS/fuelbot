# Flavor images from S3 — story set (Milestone 7)

Flavor images come from the tenant's AWS S3 bucket, named in the catalog the
config API already returns. The app downloads each image once, checks it,
trims its transparent padding, and caches it by file name. The screens never
show a gap: the new image, the flavor's previous image, the bundled image or
the placeholder, in that order. A finished download swaps in without
rebuilding the screen.

- Plan: [greenfield-rewrite.md](../../plans/greenfield-rewrite.md) §0 (the
  three 2026-09-26 decisions), §3.1 (`image_url`), §3.3 (validation), **§3.14
  (the spec)**, §3.13 (the same cache-by-file-name pattern for the ad video),
  §5 Milestone 7, §7 step 4b.
- Builds on: the [idle set](../idle/README.md) (listing, `ConfigManager`, the
  mock server), the [details set](../details/README.md), the
  [telemetry set](../telemetry/README.md) (`TelemetryReporter.report_event`)
  and the [sales set](../sales/README.md) (test isolation in
  `tests/test_runner.gd`).
- Image spec for the content team: [devdocs/image-spec.md](../../image-spec.md).
- Conventions: [CLAUDE.md](../../../CLAUDE.md).

## Execution order

| # | Story | Depends on | Produces |
|---|-------|-----------|----------|
| 01 | [Schema, validation & mock images](IMG-01-schema-and-mock-images.md) | — | `image_url` in `normalise()`/`validate_config()`; generated mock images under `mockserver/assets/flavors/`; `image_url` in the mock catalog; scenarios `images_v2`, `images_broken`; mock `asset_counts` and `?delay_ms=` |
| 02 | [`FlavorImages`: download, check, trim, cache](IMG-02-flavor-images-cache.md) | 01 | the autoload: one download at a time, limits, trim, `.tmp` + rename, flavor → file index, retry, cleanup, `image_download_failed`; test isolation |
| 03 | [Screens: show order and in-place swap](IMG-03-screens.md) | 02 | `FlavorImages.get_texture()` in the card, details and payment summary; swap on `flavor_image_ready`; bundled fallbacks trimmed once as files |
| 04 | [Image spec, end-to-end & sign-off](IMG-04-spec-e2e-signoff.md) | 01–03 | `devdocs/image-spec.md`; plan §7 step 4b run against the real app; SIGNOFF; plan / README / CLAUDE.md |

## Definition of Done (every story)

As in the sales set: `tools/run_tests.sh` → `ALL TESTS PASSED`,
`tools/check_boot.sh` → `BOOT OK` (run `godot --headless --path . --import`
first when a `class_name` is added), all Python tests → `OK`. Download and
retry tests are re-run 2–3× with `--filter=`. UI changes get a screenshot
that's actually looked at. One commit per story (`IMG-NN: <title>`), chained
with `&&` after the checks.

## Decisions

Made by the product owner (2026-09-26):

1. **Images come from AWS S3 via the config API.** Each flavor carries
   `image_url`, an HTTPS URL to an object in the tenant's S3 bucket. The
   bundled `image` (`res://…`) is only the **offline fallback**, and is
   optional when `image_url` is set.
2. **An image's file name changes every time it's updated** (e.g.
   `prymor_guava-20260926a.png`). The app caches by the URL's **file name**:
   the last path segment, ignoring any query string. A new name is
   downloaded once; a known name is never downloaded again. A changed image
   under the same name is outside the contract and not handled.
3. **The image GET has no `X-Tenant-Id` header and no credentials.** S3 URLs
   are public-read, CloudFront or presigned; the app doesn't care which.
4. **This replaces "crop the padded PNGs".** Transparent padding is trimmed
   automatically at download (`Image.get_used_rect()`).
5. **Card payments are not supported** (UPI QR only; Pine Labs is not
   ported). Nothing about payments changes in this milestone.

Made while writing this set (the product owner can revisit any of them):

6. **`http://` is allowed only for `127.0.0.1` and `localhost`** (the mock).
   Every other `image_url` must be `https://`.
7. **A non-empty but invalid `image_url` fails validation**, and the whole
   response is discarded, like every other §3.3 rule (the cache or bundled
   catalog stays). `null` or `""` means "no URL".
8. **The file name is the last path segment, percent-decoded**, and it must
   be a valid file name (`String.is_valid_filename()`, not starting with
   `.`). Otherwise the URL is invalid (decision 7). The cached file keeps
   that name whatever its content, because images are decoded by their
   signature (PNG, JPEG, WebP), never by extension.
9. **A small autoload, `FlavorImages`, owns this, not a `ConfigManager`
   helper.** It needs its own `HTTPRequest`, a retry `Timer` and a signal. It
   posts through `TelemetryReporter`, which is registered after
   `ConfigManager`. It is also testable as a fresh instance with its own
   cache folder, as the reporters are. It sits after `SalesReporter` and
   before `DevCapture`. **Deviation from plan §3.14:** `flavor_image_ready`
   is emitted by `FlavorImages`, not `ConfigManager`.
10. **Downloads start on `config_ready`** (once per boot, with whatever
    catalog won: remote, cache or bundled), not in the autoload's `_ready()`.
    The pass then uses the fresh catalog, and the test runner can isolate the
    autoload before anything is written. While anything is still missing, a
    pass is retried every `timing.image_retry_interval_sec` (600 s).
11. **Only enabled flavors are downloaded.** A disabled flavor's image stays
    in the cache while the flavor is in the catalog, but isn't fetched.
12. **The cache stores the trimmed image.** If trimming changes nothing, the
    downloaded bytes are kept as they are (no re-encode). If it trims, the
    result is saved as lossless PNG. A fully transparent image is rejected
    (`empty_image`).
13. **Size limits:** bytes via `HTTPRequest.body_size_limit` (2 MB, so an
    oversized body is never held in memory). Pixels: a PNG's header is
    checked **before** decoding (so a small file can't decode into a huge
    image on the Pi); JPEG and WebP are checked after decoding.
14. **Cleanup runs only after a pass in which every download succeeded, and
    only for a catalog from the backend** (`remote` or `cache`), never for
    the bundled default. An offline boot with no config cache therefore
    never wipes the image cache. Leftover `*.tmp` files are removed in the
    same step.
15. **`image_download_failed` is posted once per file name and reason per
    app run.** Every failure is still logged. Without this, a broken URL
    retried every 10 minutes would post 144 events a day per flavor.
    Fields: `flavor_id`, `file_name`, `reason`; never the URL, since
    presigned URLs carry signatures.
16. **Bundled fallbacks are trimmed once, as files**
    (`tools/trim_flavor_images.gd`), and scaled down to fit 600 × 800 px:
    the same spec as S3 images. The trim is not repeated at every load
    because the files were up to 2560² (up to 12 ms each to trim on a Mac,
    more on a Pi, plus the memory for every boot). The committed files also
    shrink.
17. **The mock gets two small, general features:** `asset_counts` in
    `/__mock/state` (requests per asset path, including 404s), so tests can
    prove "downloaded once" or "downloaded nothing"; and a `?delay_ms=N`
    query on `/__mock/assets/`, so a slow download can be seen, and so a
    query string on an image URL is exercised (it must not change the cache
    key).

## Show order (what a screen displays for a flavor)

`FlavorImages.get_texture(flavor)`, used by every image site:

1. **current**: the cached file named by the flavor's `image_url`;
2. **previous**: the file in the `flavor_id → file name` index for this
   flavor, if still cached (shown while an update downloads, or if it
   fails);
3. **bundled**: the flavor's `image` (`res://…`), if it exists;
4. **none**: `null`, so the site shows its existing placeholder (the tenant's
   logo text).

`FlavorImages.get_image_source(flavor)` returns `"current"`, `"previous"`,
`"bundled"` or `"none"`, for tests and the e2e walker.

A finished download emits `FlavorImages.flavor_image_ready(flavor_id)`. The
card, details page and payment summary showing that flavor replace their
texture in place: no rebuild, and no effect on an order. The catalog itself
still changes only at boot (plan §3.11).

## Cache rules

| Rule | Value |
|------|-------|
| Folder | `images.cache_dir` = `user://image_cache/` |
| Key | the URL's file name (decision 8); the query string is ignored |
| Index | `<cache_dir>/index.json`: `{flavor_id: file name}` of the last good image per flavor, written atomically |
| Download | one at a time, no `X-Tenant-Id`, `images.download_timeout_sec` (30), to `<name>.tmp`, then renamed |
| Accept | PNG, JPEG or WebP by signature; ≤ `images.max_bytes` (2 097 152); ≤ `images.max_px` (2048) on either side; not fully transparent |
| Trim | `get_used_rect()` once, at download; the trimmed image is cached |
| Retry | the next boot, and every `timing.image_retry_interval_sec` (600) while anything is missing |
| Cleanup | after a pass with no failures, on a backend catalog: delete files not named by any flavor in the catalog, plus `*.tmp` |
| Failure | logged; `image_download_failed` posted once per file name + reason per run |

Failure reasons: `unreachable`, `timeout`, `http_<status>`, `too_large_bytes`,
`too_large_px`, `not_an_image`, `empty_image`, `write_failed`.

## Out of scope

- Videos from S3 (plan §3.13 stays deferred).
- A real S3 bucket, the backend's `image_url` field, CDN setup. The mock
  stands in; the backend team owns the real ones.
- Image editing tools for the content team.
- Detecting a changed image under an unchanged file name (decision 2).
- Milestone 8 (Raspberry Pi), including checking WebP decoding on the Pi's
  export template.
