# Asset provenance

Copied from the old build (`fuelbotsource_og/`). Only files referenced by the
new project are ported (plan §5 Milestone 7).

| Destination | Source file | Note |
|-------------|-------------|------|
| `images/flavors/prymor_guava.png` | `PrymorGuava.png` | plain name kept; `PrymorGuava (1).png` not ported |
| `images/flavors/mmn_chocolate.png` | `mmn_chocolate.png` | |
| `images/flavors/prymor_electro.png` | `Prymor_Electro.png` | |
| `images/flavors/on_vanilla.png` | `OnVanilla.png` | `OnVanilla (1).png` not ported |
| `images/flavors/prymor_cookie.png` | `PrymorCookie.png` | used by the mock tenant only |
| `images/flavors/beast_coffee.png` | `BeastCoffee.png` | used by the mock tenant only; `BeastCoffee (1).png` not ported |
| `video/idle_ad_default.ogv` | `mmgc.ogv` | bundled attract video (plan §3.13) |
| — | `mmgc (1).ogv` | 48 MB, differs from `mmgc.ogv`; unreviewed alternate, not ported |
| — | `mmgc.mp4`, `PreparationVideo.webm` | not playable in this Godot build (plan §3.13), not ported |
| `fonts/*` | Google Fonts (OFL) | added by IDLE-06; licences next to the files |

**Flavor images are the offline fallback** (Milestone 7): the catalog's
`image_url` (AWS S3) is what's shown when it has downloaded; these bundled files
show before that, or when there's no network and no cached image. They were
**trimmed of their transparent padding and scaled down to fit 600 × 800**
(the S3 image spec, [devdocs/image-spec.md](../devdocs/image-spec.md)) by
`tools/trim_flavor_images.gd` on 2026-09-26 (e.g. `on_vanilla.png` 2560² →
478 × 800). After adding or replacing a bundled flavor image, run:

```bash
godot --headless --path . --script res://tools/trim_flavor_images.gd   # idempotent
godot --headless --path . --import
```
