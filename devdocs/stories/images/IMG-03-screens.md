# IMG-03 — Screens: one way to get a flavor image, swapped in place

**As a** customer, **I want** every drink to show its current picture,
filling its space, and never a blank while an image updates, **so that** the
menu looks right. **As the** operator, **I want** a new image to appear as
soon as it has downloaded, without interrupting an order.

Plan refs: §3.14 ("What the screens show"), §3.11 (the catalog changes only
at boot); README decisions 9, 16, the show order.
Depends on: IMG-02.

## Verified by spike (2026-09-26)

- The bundled PNGs are heavily padded: `prymor_cookie` is 2048² with the
  product in 756 × 1277; `on_vanilla` is 2560² → 1306 × 2186; `prymor_guava`
  is 832² → 308 × 519. They're imported lossless, so `Texture2D.get_image()`
  returns RGBA8 and `get_used_rect()` works on them. Trimming took 1–12 ms
  per image on the dev Mac.
- An `ImageTexture` built from a `user://` file shows in a `TextureRect`
  headless.

## Deliverables

```
autoload/FlavorImages.gd                          # get_texture(), get_image_source() (from IMG-02's API)
ui/components/product_card/product_card.gd       # uses get_texture(); swaps on flavor_image_ready
scenes/flavor_detail/flavor_detail.gd            # the same
scenes/payment/payment.gd                        # the order summary's image, the same
tools/trim_flavor_images.gd                      # one-off: trim + fit 600x800, in place (decision 16)
assets/images/flavors/*.png                      # trimmed output
assets/ASSETS.md                                 # note the trim and how to re-run it
tests/unit/test_flavor_image_screens.gd
tests/unit/test_config_fixtures.gd               # bundled images are trimmed and within the spec
mockserver/responses/config/images_url_only.json # added while executing: coffee has no bundled image
                                                 #   and its URL 404s -> the placeholder, deterministically
```

## Spec

### `FlavorImages.get_texture(flavor) -> Texture2D`

The show order (README): current → previous (index) → bundled → `null`.
"Current" and "previous" count only if the file exists in `cache_dir`. The
bundled image is `load(image)` if `ResourceLoader.exists(image)`.
`get_image_source()` returns which tier was used. Textures from the cache are
built once per file name and kept in memory.

### Each image site

The three sites replace `load(path)` with one private helper each:

```gdscript
func _apply_image() -> void:
	var texture := FlavorImages.get_texture(flavor)
	_image.texture = texture
	_image.visible = texture != null
	_placeholder.visible = texture == null     # card and details; payment has no placeholder

func _on_flavor_image_ready(flavor_id: String) -> void:
	if flavor_id == String(flavor.get("id", "")):
		_apply_image()
```

- **Card:** connect `FlavorImages.flavor_image_ready` in `_ready()`, which
  disconnects automatically when the card is freed.
- **Details:** connect in `_ready()`. `_render()` calls `_apply_image()`.
- **Payment summary:** keep a reference to the summary's `TextureRect`, and
  connect in `_ready()`.
- No site rebuilds its layout on the signal, and none touches `OrderState` or
  navigation.
- Add small test getters: `get_image_texture()` on the card, details and
  payment screens.

### Bundled fallbacks (`tools/trim_flavor_images.gd`)

`godot --headless --path . --script res://tools/trim_flavor_images.gd`: for
each `assets/images/flavors/*.png`, `Image.load_from_file()` on the raw file,
`FlavorImages.trim_transparent()`, then, if larger than 600 × 800, scale it
down to fit (keeping the aspect ratio, `INTERPOLATE_LANCZOS`), and
`save_png()` in place. It's idempotent: a second run changes nothing. Then
`--import`. `ASSETS.md` records it.

## Acceptance criteria

`tests/unit/test_flavor_image_screens.gd` (the real autoload, its
test-runner cache folder, files written straight into it; no network):
- [ ] `test_show_order`: cached current → `current`; only the index entry's
      file → `previous`; neither → `bundled`; no `image` either → `none`
      and `null`.
- [ ] `test_card_swaps_in_place`: a card showing the bundled image; the
      current file is written and `flavor_image_ready("guava")` emitted →
      the same card node now has the new texture, and the listing's
      `get_cards()` returns the same instances (no rebuild).
- [ ] `test_card_ignores_other_flavor`: the signal for another id → texture
      unchanged.
- [ ] `test_card_placeholder_when_none`: no URL cached, no bundled image →
      the placeholder is visible and the image hidden.
- [ ] `test_details_swaps_in_place`: the same on the details page; the
      selection and `OrderState.charged_price` are unchanged.
- [ ] `test_payment_summary_uses_flavor_images`: the summary shows the
      cached current image.

`tests/unit/test_config_fixtures.gd`:
- [ ] `test_bundled_images_are_trimmed`: every bundled flavor image has
      `get_used_rect()` equal to its full size, and fits within 600 × 800.

Screens (`tools/screenshot.sh` or a walker; looked at):
- [ ] The listing with the mock S3 images (bands visible, cookie trimmed to
      fill its card like the others).
- [ ] The details page with an S3 image.
- [ ] The listing with bundled (trimmed) images, offline.
- [ ] The placeholder case.
- [ ] Existing layout tests pass: six cards fit, a long name stays within 3
      lines.

## Out of scope

Crossfades or loading animations; downscaling downloads at runtime.
