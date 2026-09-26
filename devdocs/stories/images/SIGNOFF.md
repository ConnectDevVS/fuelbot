# Flavor images from S3 (Milestone 7) — sign-off (IMG-04)

Executed 2026-09-26 on macOS (Apple M5), Godot 4.7.2.stable.official, Python
3.9.6, branch `milestone-7-images` (off `develop`). Evidence is in
`.screenshots/img/` and `.screenshots/img-e2e/` (gitignored): walker
screenshots and `app-<flow>.log`.

The runs used their own mock (:8791) and bridge ports (5242/5245/5246) via a
temporary settings override (image retry 10 s, telemetry retry 5 s). The
override, `config_cache.json`, the telemetry and sales queues were backed up
first and restored afterwards; `user://image_cache/` didn't exist before and
was removed again. At the start the developer's own session was running on
the default ports (dev mock :8787, fake bridge, app). The app and the dev
mock ended at about 17:23, by themselves (the dev mock's log stops then); none of
our commands matched them.

**Status: plan §7 step 4b PASS (all seven flows), plus an order walked
through with S3 images.** Not verified: a real S3 bucket and WebP on the Pi
(see below).

## Automated

| Check | Result | Evidence |
|-------|--------|----------|
| `tools/run_tests.sh` | PASS | `ALL TESTS PASSED (212)` (181 → 212: flavor images 18, screens 6, validation 4, fixtures 3). `--filter=flavor_images` 3×, `--filter=image` 2×, all green |
| Python (`mockserver`, `bridge`, `fakes`, `firmware`) | PASS | 23 + 24 + 21 + 9 = 77 tests, `OK` (mock: +5 for images) |
| `tools/check_boot.sh` | PASS | `BOOT OK` |
| Suite duration | 55 s | inside the runner's 180 s limit |
| Test isolation | PASS | a full run against a stand-in dev mock (:8791, via the dev override) made **no** asset requests (`asset_counts {}`), only the boot's config GET; the real `user://image_cache/` stayed absent. Checked after IMG-02 and again on the final code |

## Plan §7 step 4b — app + mock (:8791), walker on the listing

| # | Flow | Result |
|---|------|--------|
| 1 | **first boot** (empty cache, `default`) | PASS. Six downloads, **one each** (`asset_counts` all 1), `asset_last_tenant: null` (no `X-Tenant-Id`). Vanilla, cookie and coffee showed their bundled image for ~0.3 s, then swapped in place (same card instances). Cookie **trimmed 1600×2000 → 300×400**. `index.json` has six entries |
| 2 | **restart** | PASS. `asset_counts {}`: nothing downloaded. Every card `current` from the first frame |
| 3 | **one image changed** (`images_v2`, guava v2 served in 3 s) | PASS. Only `prymor_guava-20260927a.png` requested (once). Guava `previous` (v1, one band) at 1.5 s → `current` (v2, two bands) at 3.1 s, without leaving the listing (`images_v2-01/02.png`). The pass then **deleted v1** |
| 4 | **image server unreachable** (mock killed during guava v2's download, restarted 6 s later) | PASS. `unreachable`; guava kept v1. `image_download_failed` was in `user://telemetry_queue.json` while the mock was down, and was **posted once** after it came back (`telemetry posts 1`). The 10 s retry then downloaded v2 and swapped it in |
| 5 | **404 / corrupt / too wide** (`images_broken`) | PASS. Reasons `http_404`, `not_an_image`, `too_large_px`. Chocolate, electro and vanilla stayed on their `previous` images. Three passes (boot + two retries) = 9 failures, **3 telemetry posts**. Nothing cleaned up (a stale v2 file stayed) |
| 6 | **cleanup** (back to `default` after 3) | PASS. Guava v1 downloaded again (1 request); the successful pass removed `prymor_guava-20260927a.png` |
| 7 | **offline first boot** | PASS. No image cache, no config cache, backend unreachable → the bundled catalog, all `bundled` (trimmed: 308×519, 600×696, 472×800, 478×800). With a cached `images_url_only` catalog and no image cache, offline: five `bundled`, coffee `none` → the **placeholder** (`offline_placeholder-01.png`) |
| — | **order** with S3 images | PASS. Listing → details (`order-details.png`) → payment: the summary shows guava's S3 image (`order-payment.png`) → Cancel → the QR closed, back to idle |

## Visual (looked at)

- `.screenshots/img/listing-s3.png`: the six mock S3 cups; the padded
  cookie fills its card like the others.
- `.screenshots/img/details-cookie.png`: details from the cache (no new
  requests).
- `.screenshots/img/listing-offline-bundled.png`: the bundled images,
  trimmed, now filling the card image area (before, they were small in the
  middle of their padding).
- `.screenshots/img/listing-placeholder.png` and
  `img-e2e/offline_placeholder-01.png`: coffee's "PF" placeholder.
- The existing layout tests still pass (six cards fit; long names).

## Issues found and fixed during execution

1. **The bundled-image trim wasn't idempotent.** Lanczos down-scaling left
   fully transparent edge rows, so a second run trimmed electro again (473 →
   472 px wide). The tool now trims again after resizing, and a second and
   third run change nothing.
2. **Mock fixtures carried a literal `{{origin}}`.** `load_mock_config()`
   normalised the raw scenario, so the new `image_url` rule rejected every
   mock catalog in the tests. `TestCase` now fills `{{origin}}` in the way
   the server does (`mock_body_with_origin()`).
3. **The mock's counts arrive as JSON floats** (`1.0`), which failed dict
   comparisons: the known gotcha. The tests convert them to int.
4. The runner listed a test image folder that didn't exist yet, which printed
   an engine error. It now creates the folder first.
5. Harness only: the first spike hung on an `HTTPRequest` with no timeout
   against a closed port. `FlavorImages` always sets one
   (`images.download_timeout_sec`).

## Observations (for review, not changed)

- **Tests still touch the real `config_cache.json`** (existing, not images):
  the test process's `ConfigManager` boots with the real paths and the dev
  override before the runner can isolate it. It makes one config GET to the dev
  mock and rewrites `user://config_cache.json` (seen in the isolation check:
  the cache pointed at the stand-in mock afterwards; restored). No image
  downloads follow, because `FlavorImages` is stopped first. Fixing it
  means letting `ConfigManager` skip its automatic boot under the test runner.
- **`tools/check_boot.sh` is a real 5 s boot:** with a dev mock running, it
  downloads the images into the real `user://image_cache/`, like any dev
  launch.
- **The bundled images now fill the card** (trimmed), so the bundled and S3
  images look alike. This is a visible change from the earlier, padded look.

## Not verified

- **A real S3 bucket:** HTTPS/TLS to S3 or CloudFront, and a real presigned
  URL (only the mock's query strings were tested). This needs the backend
  team's bucket and the config API's `image_url` field.
- **WebP (and PNG/JPEG decoding) on the Pi's arm64 export template**
  (Milestone 8). WebP was verified headless on macOS only.
- **A real 2 MB+ file:** the byte limit was tested with `max_bytes` lowered to
  1000 (the same `body_size_limit` path).
- `dev_setup.gd -- --clear` removing `user://image_cache/` was not run on this
  machine, because it would also wipe the developer's provisioning.

## Open items

- The backend team: the real S3 bucket, the config API's `image_url` field,
  and the content team using [devdocs/image-spec.md](../../image-spec.md).
- Milestone 8 (Raspberry Pi), including the WebP check above.
- Carried over: Level 2/3 hardware runs, motors 5–6 wiring, Milestone 2 Part
  B (real Razorpay test mode), refund policy, real sales/telemetry backends.
