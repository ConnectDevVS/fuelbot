# IMG-02 — `FlavorImages`: download, check, trim and cache

**As the** operator, **I want** each flavor image downloaded once, checked,
trimmed and kept on the machine, **so that** the listing always shows the
right image, even offline, without downloading it on every boot.

Plan refs: §3.14 (download, auto-trim, failures, cleanup), §3.13 (the same
pattern for the video); README decisions 2, 3, 8–15, the cache rules.
Depends on: IMG-01.

## Verified by spike (2026-09-26, headless Godot 4.7.2, `tmp_capture/spike.gd`, not committed)

- `Image.load_png/jpg/webp_from_buffer` all work headless. A lossless WebP
  round-trip keeps alpha (format RGBA8). JPEG decodes as RGB8, and its
  `get_used_rect()` is the full image, so a JPEG is never trimmed.
- `get_used_rect()` on an RGBA image with a centred 120 × 200 block returns
  exactly that block. On a fully transparent image it returns size `(0, 0)`.
- A corrupt PNG makes `load_png_from_buffer` return `ERR_PARSE_ERROR` and
  print engine `ERROR:` lines (expected in the corrupt-file tests, like the
  malformed-JSON ones; `run_tests.sh` doesn't match them).
- `HTTPRequest` GET from the mock → 200 and the body. Writing `user://…/x.png.tmp`
  and then `DirAccess.rename_absolute()` works, and an `ImageTexture` from that
  file shows in a `TextureRect` headless (size 666 × 666).
- `body_size_limit = 1000` on a 2329-byte asset → result 7
  (`RESULT_BODY_SIZE_LIMIT_EXCEEDED`), empty body. A 404 → result 0, code
  404. A closed port → result 2 (`RESULT_CANT_CONNECT`).

## Deliverables

```
autoload/FlavorImages.gd        # the autoload (no class_name)
project.godot                   # FlavorImages after SalesReporter, before DevCapture
config/local_settings.json      # images.{cache_dir,max_bytes,max_px,download_timeout_sec}; timing.image_retry_interval_sec
tests/test_runner.gd            # _isolate_app(): test cache dir, no auto sync
tests/unit/test_flavor_images.gd
```

## Spec

### Settings

```json
"images": {"cache_dir": "user://image_cache", "max_bytes": 2097152, "max_px": 2048, "download_timeout_sec": 30},
"timing": {"image_retry_interval_sec": 600}
```

### `autoload/FlavorImages.gd`

```gdscript
signal flavor_image_ready(flavor_id: String)          # a new current image is cached for this flavor
signal download_failed(flavor_id: String, file_name: String, reason: String)
signal pass_finished(ok: bool)                       # ok = no failures in this pass

var cache_dir := "user://image_cache"   # the plain vars are overridable by tests
var max_bytes := 2097152
var max_px := 2048
var download_timeout_sec := 30.0
var retry_interval_sec := 600.0
var auto_configure := true              # _ready(): configure_from_settings()
var auto_sync := true                   # sync on ConfigManager.config_ready; the test runner turns it off
var report_failure: Callable            # default: TelemetryReporter.report_event(event, "app")

func configure_from_settings() -> void   # reads settings, reloads the index, (re)starts the retry timer
func sync(flavors: Array, allow_cleanup: bool) -> void   # start a pass (or queue one if busy)
func get_texture(flavor: Dictionary) -> Texture2D       # IMG-03; the show order
func get_image_source(flavor: Dictionary) -> String     # "current" | "previous" | "bundled" | "none"
func is_busy() -> bool
func missing_count() -> int                             # enabled flavors whose current file isn't cached
func reload_index() -> void
static func decode(bytes: PackedByteArray) -> Image      # by signature: PNG / JPEG / WebP; null otherwise
static func trim_transparent(image: Image) -> Image      # get_used_rect(); the same image if nothing to trim
```

- **`_ready()`** only reads: settings and the index. Nothing is written or
  downloaded until a pass starts. If `auto_sync`, it connects
  `ConfigManager.config_ready` → `sync(ConfigManager.current_config.flavors,
  ConfigManager.config_source != "default")`. If `ConfigManager.config_loaded`
  is already true, the same call is deferred.
- **A pass** (`sync`):
  1. Remember the catalog and `allow_cleanup` (the retry timer reuses them).
  2. For every **enabled** flavor with a non-empty `image_url`: if the file
     `<cache_dir>/<name>` exists, set `index[id] = name` (if different).
     Otherwise add it to the download list, one entry per file name (two
     flavors sharing a file download it once).
  3. Download the list **one at a time** with a single `HTTPRequest`
     (`timeout = download_timeout_sec`, `body_size_limit = max_bytes`,
     headers: none beyond Godot's defaults, so **no `X-Tenant-Id`**).
  4. For each response:
     - result ≠ SUCCESS → `timeout` (`RESULT_TIMEOUT`), `too_large_bytes`
       (`RESULT_BODY_SIZE_LIMIT_EXCEEDED`), else `unreachable`;
     - code ≠ 200 → `http_<code>`;
     - PNG whose IHDR width/height > `max_px` → `too_large_px` (before decoding);
     - `decode()` → null → `not_an_image`;
     - width or height > `max_px` → `too_large_px`;
     - `trim_transparent()` → size 0 → `empty_image`;
     - write: untrimmed → the original bytes; trimmed → `save_png_to_buffer()`.
       Write to `<name>.tmp`, then `rename_absolute` to `<name>`. Any error →
       `write_failed` (the `.tmp` is removed).
     - on success: `index[id] = name` for every flavor using that file; save
       the index atomically; emit `flavor_image_ready(id)` for each; log
       `[Images] cached <name> (<w>x<h>, trimmed from <W>x<H>)`.
     - on failure: `push_warning("[Images] <id> <name>: <reason>")`, emit
       `download_failed`, and, the first time this `(name, reason)` is seen
       in this run, `report_failure.call({"v": 1, "event_type":
       "image_download_failed", "flavor_id": id, "file_name": name,
       "reason": reason})`.
  5. At the end: emit `pass_finished(ok)`. If `ok` and `allow_cleanup`, delete
     every file in `cache_dir` except `index.json` and the file names of
     **all** flavors in the catalog (enabled or not), including `*.tmp`, and
     drop index entries whose file is gone. Drop deleted names from the
     in-memory texture cache.
  6. If `sync` was called during the pass, run once more with the newest
     catalog.
- **Retry:** a `Timer` (`retry_interval_sec`, repeating). On timeout, if not
  busy and `missing_count() > 0`, run a pass with the remembered catalog.
  The next boot retries anyway (step 2 finds the file missing).
- **Index file:** `<cache_dir>/index.json`, `{"guava": "prymor_guava-20260926a.png"}`,
  written as `.tmp` + rename. Unreadable → treated as empty (logged).
- **Textures** are built from the cached bytes with `decode()` +
  `ImageTexture.create_from_image()`, and kept in memory per file name
  (`load()` doesn't work for `user://` files that were never imported).

### Test isolation (`tests/test_runner.gd`)

`_isolate_app()` adds: `FlavorImages.auto_sync = false`, disconnect its
`config_ready` handler, `cache_dir = "user://test_runner/image_cache"`
(emptied first), `reload_index()`, stop the retry timer. The dev override's
config fetch at boot can't start a download, because the handler is
disconnected before any `config_ready` (deferred or HTTP) can arrive. Tests
that need downloads use a **fresh instance**.

## Acceptance criteria

`tests/unit/test_flavor_images.gd`: a fresh instance
(`load("res://autoload/FlavorImages.gd").new()`, `auto_configure = false`,
`auto_sync = false`, `cache_dir = "user://test_images/<test>"`, short timeouts,
`report_failure` capturing into an array), and flavors pointing at the test
mock (`http://127.0.0.1:8788/__mock/assets/flavors/…`). `mock_reset()` in
`before_each`.
- [ ] `test_downloads_each_once`: two flavors → both files cached, index
      has both, `flavor_image_ready` fired for both, `asset_counts` 1 each; a
      second `sync` → no new requests.
- [ ] `test_restart_downloads_nothing`: a new instance on the same folder →
      `pass_finished(true)` and no asset requests.
- [ ] `test_changed_name_downloads_only_that`: guava v1 + chocolate cached;
      guava switched to v2 → exactly one request (v2); index guava → v2.
- [ ] `test_query_string_ignored`: the same file with `?delay_ms=1` and
      then `?sig=abc` → one download.
- [ ] `test_padded_image_is_trimmed`: the cookie file is cached at 300 × 400
      (from 1600 × 2000).
- [ ] `test_untrimmed_bytes_kept`: a normal image's cached bytes equal the
      served file.
- [ ] `test_decode_formats`: PNG, JPEG and WebP buffers (made with
      `save_*_to_buffer`) decode; junk → null; WebP with a transparent
      border trims.
- [ ] `test_404_corrupt_too_wide_rejected`: reasons `http_404`,
      `not_an_image`, `too_large_px`; no file and no `.tmp` left;
      `pass_finished(false)`.
- [ ] `test_too_many_bytes`: `max_bytes = 1000` → `too_large_bytes`.
- [ ] `test_unreachable`: `http://127.0.0.1:<closed port>/x.png` → `unreachable`.
- [ ] `test_failure_reported_once`: the same failure in two passes → two
      `download_failed`, one `report_failure` call, with `flavor_id`,
      `file_name` and `reason` and no URL.
- [ ] `test_failure_event_via_telemetry`: with the default `report_failure`,
      the record reaches `TelemetryReporter`'s (test) queue as
      `image_download_failed`, `source: "app"`.
- [ ] `test_no_tenant_header`: after a download, the mock's
      `asset_last_tenant` is `null` (no `X-Tenant-Id` sent), even though the
      instance's app has a tenant.
- [ ] `test_cleanup_after_success`: a stale file and a `stale.tmp` in the
      folder → deleted after a successful pass with `allow_cleanup`; the
      index entry for a flavor no longer in the catalog is dropped.
- [ ] `test_no_cleanup_after_failure_or_default`: a failed pass, or
      `allow_cleanup = false` → the stale file stays.
- [ ] `test_disabled_flavor_kept_not_downloaded`.
- [ ] `test_retry_timer`: `retry_interval_sec = 0.3`, a 404 → requested again
      within 2 s; after success nothing more is requested.
- [ ] `test_isolation`: the autoload's `cache_dir` is the test folder and
      `auto_sync` is false.
- [ ] Timing tests re-run 3× (`--filter=flavor_images`).

Manual isolation check (recorded in the commit message and the SIGNOFF): the
dev mock's `asset_counts` and a fingerprint (`ls -la` + md5) of the real
`user://image_cache/` are the same before and after a full `run_tests.sh`.

## Out of scope

Screens (IMG-03); videos; downscaling downloads (the spec asks the content
team for 600 × 800).
