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
letters (lower / upper)                    symbols
┌──────────────────────────────────┐       ┌──────────────────────────────────┐
│ 1  2  3  4  5  6  7  8  9  0      │       │ !  @  #  $  %  ^  &  *  (  )      │
│ q  w  e  r  t  y  u  i  o  p      │       │ -  _  =  +  [  ]  {  }  \  |      │
│  a  s  d  f  g  h  j  k  l        │       │ ;  :  '  "  ,  .  <  >  /  ?      │
│ ⇧   z  x  c  v  b  n  m   DEL     │       │     `  ~                  DEL     │
│ ?123     space        Connect     │       │ ABC      space        Connect     │
└──────────────────────────────────┘       └──────────────────────────────────┘
```

- `class_name OnScreenKeyboard`, a `PanelContainer` (`SURFACE`, a `BORDER`
  line on top). Rows are 10 units wide; keys share the width by stretch
  ratio (shift and DEL 1.5, the layer key 2, space 5, submit 3), 110 px
  tall with 8 px gaps. Keys are `GhostButton`s (Archivo 44 for characters),
  submit is `PrimaryButtonM`. It fits inside the page margins (936 px) as
  well as the full width. Pinned to the bottom of the password page.
- DEL is in the same place on every layer, and the bottom row (layer key,
  space, submit) is the same on every layer.
- **Layers:** lower case, upper case (⇧: one letter, then back to lower
  case, the ⇧ in accent; a second tap keeps capitals on, the key filled;
  a third turns it off), and symbols (`?123`, all 32 ASCII symbols, `ABC`
  to go back, which also resets shift). Every printable ASCII character can
  be typed: Wi-Fi passwords are 8–63 printable ASCII. ⇧ is drawn with
  JetBrains Mono, the only bundled font that has it.
- Labels come from messages: `keyboard_symbols` (`?123`),
  `keyboard_letters` (`ABC`), `keyboard_space` (`space`),
  `keyboard_delete` (`DEL`), `keyboard_submit` (`OK`, the default submit
  label).
- **Signals:** `text_changed(text)`, `submitted(text)`. The keyboard owns
  the text (`get_text()`, `clear()`, `max_length` = 63); it doesn't own the
  field that displays it.
- The submit key's label is set by the page (`set_submit_label`) and can be
  disabled (`set_submit_enabled`); the password page disables it below 8
  characters.
- DEL deletes one character on press; holding it repeats after 0.5 s,
  every 0.08 s.
- A pressed key shows the theme's pressed style until release, so a touch
  is visible even though the password itself is hidden.
- No text, typed or not, is ever logged.
- Works with a USB keyboard too (`_unhandled_key_input`): printable
  characters, Backspace and Enter (submit) go to the same text (handy for a
  technician who carries one).

## Acceptance criteria

- [ ] Typing on the keys builds the expected text across all three layers,
      including shift once and caps lock.
- [ ] Every printable ASCII character can be produced.
- [ ] `max_length` stops at 63; ⌫ on empty does nothing; held ⌫ repeats.
- [ ] Submit disabled emits nothing; enabled emits `submitted` with the
      text.
- [ ] A physical key event adds its character.
- [ ] Layout test: the keyboard fits 936 px wide (inside the page
      margins) and leaves at least 900 px above it on a 1920 px screen.
- [ ] Gallery screenshot looked at: keys and labels readable. (The gallery
      page is already wider than the screen because of its product cards,
      so the full-width look is checked on the password page in SET-04.)
