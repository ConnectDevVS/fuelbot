# IMG-01 — `image_url` in the schema, validation, and mock images

**As the** content team, **I want** each flavor in the catalog to name its
image in S3, **so that** an image can change without an app release. **As a**
developer, **I want** the mock to serve realistic flavor images (normal,
padded, broken), **so that** the download code can be built and tested
without a real bucket.

Plan refs: §3.1 (`image_url`), §3.3 (validation step 6), §3.14 (source, cache
key); README decisions 1–3, 6–8, 17.
Depends on: nothing in this set.

## Deliverables

```
autoload/ConfigManager.gd              # normalise(): image_url/image default ""; validate_config(): image OR image_url;
                                       #   static image_file_name(url), is_valid_image_url(url)
mockserver/make_flavor_images.py       # stdlib generator (PNG writer as in make_demo_qr.py)
mockserver/assets/flavors/*.png        # its committed output (list below)
mockserver/server.py                   # asset_counts in /__mock/state; ?delay_ms=N on /__mock/assets/
mockserver/responses/config/default.json        # image_url on all six flavors
mockserver/responses/config/images_v2.json      # guava's file name changed
mockserver/responses/config/images_broken.json  # a 404, a corrupt file, a too-wide image
mockserver/test_server.py
mockserver/README.md                   # the images, scenarios, asset_counts, delay_ms
tests/unit/test_config_manager.gd      # validation cases
tests/unit/test_config_fixtures.gd     # mock image_url fixtures
```

## Spec

### `ConfigManager`

- `normalise()`: per flavor, `image_url` and `image` default to `""`
  (`null` → `""`), so scenes can trust both are Strings.
- `validate_config()`: replace "image missing" with: a flavor needs a
  non-empty `image` **or** a non-empty `image_url`. If `image_url` is present
  and not `null`/`""`, it must be a String and pass `is_valid_image_url()`;
  otherwise `"<id>: image_url must be https:// with a file name"`. `image`, if
  present and non-null, must be a String.
- `static func image_file_name(url: String) -> String`: strip `#…` and
  `?…`, take the text after the last `/` of the path, `uri_decode()` it.
  Return `""` if the URL has no path segment, if the name is empty, if it
  starts with `.`, or if it fails `is_valid_filename()`. Examples:
  - `https://b.s3.ap-south-1.amazonaws.com/m-042/flavors/prymor_guava-20260926a.png?X-Amz-Signature=ab`
    → `prymor_guava-20260926a.png`
  - `https://cdn.example.com/a/b%20c.webp` → `b c.webp`
  - `https://cdn.example.com/a/` → `""`; `https://cdn.example.com` → `""`
- `static func is_valid_image_url(url: String) -> bool`: `https://<host>/…`
  with a host, **or** `http://127.0.0.1[:port]/…` / `http://localhost[:port]/…`
  (decision 6), and `image_file_name(url) != ""`.

### Mock images (`mockserver/make_flavor_images.py`, stdlib only)

Writes to `mockserver/assets/flavors/`. Each image is a transparent RGBA PNG
of a simple shaker cup in the flavor's colour. White horizontal bands on the
cup show the **version** (1 band = `…a`, 2 bands = the v2 image), so a
screenshot tells versions and bundled images apart.

| File | Size | Purpose |
|------|------|---------|
| `prymor_guava-20260926a.png` | 600 × 800 | normal, v1 |
| `prymor_guava-20260927a.png` | 600 × 800 | normal, **v2** (2 bands), for `images_v2` |
| `mmn_chocolate-20260926a.png`, `prymor_electro-20260926a.png`, `on_vanilla-20260926a.png`, `beast_coffee-20260926a.png` | 600 × 800 | normal |
| `prymor_cookie-20260926a.png` | 1600 × 2000, the cup 300 × 400 in the middle | **heavily padded**: proves the trim |
| `broken-20260926a.png` | PNG signature + junk (~200 B) | **corrupt** |
| `too_wide-20260926a.png` | 2100 × 60 | **over the pixel limit** (a tiny file) |

"Over the byte limit" is not committed as a 2 MB file: IMG-02's test lowers
`max_bytes` on a test instance and downloads a normal image, which runs the
same code path (`body_size_limit`).

### Mock server

- The asset handler already serves subfolders (verified by a spike,
  2026-09-26: `/__mock/assets/sub/qr.png` → 200). A test pins it.
- `asset_counts`: `{"flavors/prymor_guava-20260926a.png": 1, …}` in
  `/__mock/state`, counting every asset GET (including 404s), cleared by
  `/__mock/reset`. `asset_last_tenant`: the `X-Tenant-Id` of the last asset
  GET (`null` if absent), so a test can prove image requests don't send it.
- `?delay_ms=N` on an asset URL sleeps N ms (at most 10 000) before
  responding. Other query parameters are ignored.

### Config scenarios

- `default`: every flavor gets
  `"image_url": "{{origin}}/__mock/assets/flavors/<file>"` (table above;
  cookie → the padded image). `image` (`res://…`) stays on every flavor as
  the fallback.
- `images_v2` (extends `default`): guava →
  `prymor_guava-20260927a.png?delay_ms=3000` (a slow download, so the
  previous image can be seen; the query string also proves the key ignores
  it).
- `images_broken` (extends `default`): chocolate → `mmn_chocolate-20260926z.png`
  (404), electro → `broken-20260926a.png` (corrupt), vanilla →
  `too_wide-20260926a.png` (too wide).

## Acceptance criteria

`tests/unit/test_config_manager.gd`:
- [ ] `test_validate_image_or_image_url`: `image` only → OK; `image_url`
      only (https) → OK; both empty → error; `image_url` `null` + `image` → OK.
- [ ] `test_validate_image_url_scheme`: `http://example.com/a.png` → error;
      `http://127.0.0.1:8787/a.png`, `http://localhost/a.png`,
      `https://x.s3.amazonaws.com/a.png` → OK; `ftp://…`, `https://x.com/`,
      `https://x.com/a/.hidden` → error.
- [ ] `test_image_file_name`: the examples above, including the presigned
      query string.
- [ ] `test_normalise_image_defaults`: missing or `null` → `""`.

`tests/unit/test_config_fixtures.gd`:
- [ ] `test_mock_default_image_urls`: every flavor in `default` has a valid
      `image_url` (with `{{origin}}` replaced by the test origin) and a
      bundled `image` that exists.
- [ ] `test_image_scenarios_validate`: `images_v2` and `images_broken` pass
      `validate_config()` (the broken files are a *download* problem, not a
      schema one).

`mockserver/test_server.py`:
- [ ] `test_flavor_asset_subfolder`: `flavors/prymor_guava-20260926a.png` →
      200 `image/png`; the missing one → 404; `flavors/../../server.py` → 404.
- [ ] `test_asset_counts`: two GETs + one 404 → counts 2 and 1;
      `asset_last_tenant` null, or the header when sent; reset clears them.
- [ ] `test_asset_delay_ms`: `?delay_ms=300` takes ≥ 0.3 s and returns the same bytes.
- [ ] `test_default_image_urls_point_at_existing_assets`: every `image_url`
      in `default` and `images_v2` resolves to a file in `assets/`.
- [ ] `test_generated_images_are_reproducible`: the generator's output
      matches the committed files pixel for pixel (IHDR + decompressed IDAT,
      so a different zlib build doesn't fail it).
- [ ] The existing scenario tests still pass (`image` still `res://…`).

## Out of scope

Downloading (IMG-02); screens (IMG-03); a real bucket.
