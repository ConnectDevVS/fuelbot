# SET-03 — On-screen keyboard

**As** a technician, **I want** a large on-screen keyboard, **so that** I
can type a Wi-Fi password on the touchscreen. Godot only shows a system
keyboard on mobile platforms, so the Pi needs our own.

Refs: README decision 4.
Depends on: —.

## Deliverables

```
ui/components/keyboard/Keyboard.tscn
ui/components/keyboard/keyboard.gd     # class_name OnScreenKeyboard
ui/gallery/                            # the keyboard added to the component gallery
tests/unit/test_keyboard.gd
```

## Spec

```
┌───────────────────────────────────────────────┐
│ 1  2  3  4  5  6  7  8  9  0                   │
│ q  w  e  r  t  y  u  i  o  p                   │
│  a  s  d  f  g  h  j  k  l                     │
│ ⇧   z  x  c  v  b  n  m   ⌫                    │
│ ?123        space           Connect            │
└───────────────────────────────────────────────┘
```

- Full width (1080 px), keys about 96 × 110 px with 8 px gaps; `Mono`
  variation at a size readable at arm's length. Pinned to the bottom of
  the password page.
- **Layers:** lower case, upper case (⇧: one letter, then back to lower
  case; a second tap on ⇧ keeps capitals on, shown filled), and symbols
  (`?123`: `! @ # $ % & * - _ + = ( ) / \ : ; " ' , . ? ~`, with `ABC` to go
  back). Every printable ASCII character can be typed: Wi-Fi passwords are
  8–63 printable ASCII.
- **Signals:** `text_changed(text)`, `submitted(text)`. The keyboard owns
  the text (`get_text()`, `clear()`, `max_length` = 63); it doesn't own the
  field that displays it.
- The submit key's label is set by the page (`set_submit_label`) and can be
  disabled (`set_submit_enabled`); the password page disables it below 8
  characters.
- ⌫ deletes one character; holding it repeats after 0.5 s.
- A pressed key darkens until release, so a touch is visible even though
  the password itself is hidden.
- No text, typed or not, is ever logged.
- Works with a USB keyboard too: physical key presses are added to the same
  text (handy for a technician who carries one).

## Acceptance criteria

- [ ] Typing via `click()` on keys builds the expected text across all three
      layers, including shift once and caps lock.
- [ ] Every printable ASCII character can be produced.
- [ ] `max_length` stops at 63; ⌫ on empty does nothing; held ⌫ repeats.
- [ ] Submit disabled emits nothing; enabled emits `submitted` with the
      text.
- [ ] A physical key event adds its character.
- [ ] Layout test: the keyboard fits 1080 px wide and leaves at least
      900 px above it on a 1920 px screen.
- [ ] Gallery screenshot looked at: keys readable, nothing clipped.
