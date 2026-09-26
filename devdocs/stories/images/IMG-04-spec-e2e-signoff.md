# IMG-04 — Image spec, end-to-end verification and sign-off

**As the** product owner, **I want** a written image spec for the content
team, and evidence that images download once, update without a gap, survive
failures and clean up after themselves in the real app, **so that**
Milestone 7 can be called done in software.

Plan refs: §3.14 (image spec), §5 Milestone 7, §7 step 4b.
Depends on: IMG-01 … IMG-03.

## Deliverables

```
devdocs/image-spec.md                   # for the content team
devdocs/stories/images/SIGNOFF.md
devdocs/plans/greenfield-rewrite.md     # §0 log + status, §3.14 as built, §4, §5 (M7), §7 4b note
README.md, CLAUDE.md, mockserver/README.md
```

The walker and captures stay uncommitted (`tmp_capture/`,
`.screenshots/img-e2e/`).

## Spec

### `devdocs/image-spec.md`

For people who upload images, not developers. Format (transparent PNG or
WebP; JPEG is accepted but has no transparency), framing (the product
tightly framed; leftover transparent borders are trimmed anyway),
**600 × 800 px portrait** recommended, at most **2 MB** and **2048 px** on
either side, and **a new file name on every change**. A worked example of a
good name change (`prymor_guava-20260926a.png` → `prymor_guava-20261014a.png`,
with the config's `image_url` updated) and of the mistake (overwriting
`prymor_guava.png` in place: machines that already have it never see the
change). What the machine does with a bad file (keeps the old image, reports
`image_download_failed`). How long a change takes to appear (the next
restart of the machine, since the catalog is read at boot).

### Environment

Don't disturb the developer's session: check `pgrep`/`lsof` first. If the
default ports are busy, use our own mock port and bridge ports (e.g. mock
:8791, bridge 5242/5245/5246) through a temporary
`user://local_settings.override.json`, with `timing.image_retry_interval_sec`
lowered (e.g. 10). Back up and restore the override, `config_cache.json` and
`image_cache/` (absent before this milestone). Never kill a process we
didn't start. Walker waits use the wall clock and `process_frame`, never
`RenderingServer.frame_post_draw`.

### Plan §7 step 4b (app + mock, a walker on the listing)

| # | Flow | Setup | Expected |
|---|------|-------|----------|
| 1 | first boot | empty image cache, `default` | each of the six images downloaded **once** (`asset_counts`); cards show them; cookie trimmed; `index.json` has six entries |
| 2 | restart | same | **no** asset requests; images from the cache at once |
| 3 | one image changed | `images_v2` (guava v2, `delay_ms=3000`) | only guava v2 is requested; guava shows **v1 (1 band) during the download, then v2 (2 bands)** without leaving the listing; v1 deleted after the pass |
| 4 | image server unreachable | the mock killed after the config fetch (or `image_url`s on a closed port) | cached images stay; `image_download_failed` `unreachable` in the telemetry queue, posted once the mock is back |
| 5 | 404 / corrupt / too wide | `images_broken` | chocolate, electro and vanilla keep their previous (cached) images; three `image_download_failed` posted (`http_404`, `not_an_image`, `too_large_px`), once each even after a retry interval; nothing cleaned up |
| 6 | cleanup | back to `default` after 3 | the pass succeeds; unreferenced files are gone |
| 7 | offline first boot | no image cache, no config cache, mock down | the bundled (trimmed) images; with a flavor whose only image is `image_url` (walker-injected config), the placeholder |

A normal order walked through listing → details → payment with S3 images is
also captured, to confirm nothing about ordering changes.

## Acceptance criteria

- [ ] `devdocs/image-spec.md` written as above.
- [ ] SIGNOFF.md: automated results, the isolation check (dev mock
      `asset_counts` and the real image cache fingerprint unchanged by a
      full test run), the step 4b table with evidence, screenshots, issues
      found and fixed, what wasn't verified (a real S3 bucket, WebP on the
      Pi), and open items.
- [ ] Plan: §0 decisions (README 6–17), status; §3.14 as built
      (`FlavorImages`, the signal's owner, the settings); §4 (`FlavorImages`,
      `image_cache/`); §5 M7 status.
- [ ] README.md: how images work in dev, the image scenarios and how to
      switch them. CLAUDE.md: rules, commands, gotchas; the S3 images open
      item resolved (pending the real bucket and backend field).
- [ ] The tree is clean; no mock, walker or fake of ours still running; the
      override and the user:// files restored.

## Out of scope

A real S3 bucket or backend; videos from S3; Milestone 8.
