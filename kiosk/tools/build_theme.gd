extends SceneTree
## Generates assets/theme/fonts/*.tres and assets/theme/fuelbot_theme.tres from
## ui/theme/palette.gd. Output is committed; re-run after changing tokens:
##   godot --headless --path . --import
##   godot --headless --path . --script res://tools/build_theme.gd

const P = preload("res://ui/theme/palette.gd")
const ARCHIVO := "res://assets/fonts/Archivo-Variable.ttf"
const MONO := "res://assets/fonts/JetBrainsMono-Variable.ttf"
const FONT_DIR := "res://assets/theme/fonts"
const THEME_PATH := "res://assets/theme/fuelbot_theme.tres"
const WIDTH := 100  # Archivo wdth axis; the design's display type reads close to normal width.

var theme := Theme.new()
var fonts := {}


func _initialize() -> void:
	DirAccess.make_dir_recursive_absolute(FONT_DIR)
	var archivo: FontFile = load(ARCHIVO)
	var mono: FontFile = load(MONO)
	fonts.display_900 = _variation("display_900", archivo, {"wght": 900, "wdth": WIDTH})
	fonts.heading_800 = _variation("heading_800", archivo, {"wght": 800, "wdth": WIDTH})
	fonts.body_400 = _variation("body_400", archivo, {"wght": 400, "wdth": WIDTH})
	fonts.body_600 = _variation("body_600", archivo, {"wght": 600, "wdth": WIDTH})
	fonts.mono_500 = _variation("mono_500", mono, {"wght": 500}, 2, [archivo])

	theme.default_font = fonts.body_400
	theme.default_font_size = 34
	theme.set_color("font_color", "Label", P.TEXT)

	# Display sizes use an exact line pitch measured from the PDF.
	_label("DisplayXL", fonts.display_900, 128, P.TEXT, 118)
	_label("DisplayL", fonts.display_900, 100, P.TEXT, 96)
	_label("Heading", fonts.heading_800, 42, P.TEXT)
	_label("HeadingDim", fonts.heading_800, 42, P.TEXT_DIM)
	_label("Body", fonts.body_400, 34, P.TEXT_MUTED)
	_label("BodyStrong", fonts.body_600, 34, P.TEXT_MUTED)
	_label("Mono", fonts.mono_500, 24, P.TEXT_DIM)
	_label("MonoMuted", fonts.mono_500, 26, P.TEXT_MUTED)
	_label("MonoAccent", fonts.mono_500, 26, P.ACCENT)
	_label("MonoWarning", fonts.mono_500, 26, P.WARNING)
	_label("MonoValue", fonts.mono_500, 27, P.TEXT)
	_label("Clock", fonts.mono_500, 32, P.TEXT)
	_label("Price", fonts.display_900, 60, P.ACCENT)
	_label("PriceSoldOut", fonts.display_900, 60, P.TEXT_DIM)
	_label("LogoText", fonts.display_900, 42, P.ON_ACCENT)
	_label("BadgeText", fonts.mono_500, 20, P.ON_ACCENT)
	_label("ButtonText", fonts.display_900, 52, P.ON_ACCENT)
	# Details page (DET-01)
	_label("DisplayM", fonts.display_900, 80, P.TEXT, 76)
	_label("BodySmall", fonts.body_400, 28, P.TEXT_MUTED)
	_label("SectionLabel", fonts.mono_500, 22, P.TEXT_DIM)
	_label("ChipText", fonts.heading_800, 26, P.TEXT)
	_label("AllergenCaption", fonts.mono_500, 20, P.ON_ACCENT)
	_label("AllergenText", fonts.display_900, 46, P.ON_ACCENT)
	_label("AllergenIcon", fonts.display_900, 44, P.WARNING)
	_label("NutritionValue", fonts.display_900, 52, P.TEXT)
	_label("NutritionValueAccent", fonts.display_900, 52, P.ACCENT)
	_label("NutritionLabel", fonts.mono_500, 20, P.TEXT_DIM)
	_label("StepText", fonts.mono_500, 22, P.TEXT_MUTED)
	_label("LogoTextSmall", fonts.display_900, 22, P.ON_ACCENT)
	# Payment (PAY-05)
	_label("DisplayS", fonts.display_900, 72, P.TEXT)
	_label("StatusText", fonts.heading_800, 36, P.TEXT)
	_label("Countdown", fonts.mono_500, 34, P.TEXT_MUTED)
	_label("QrCaption", fonts.mono_500, 24, P.QR_CAPTION)
	_label("QrMessage", fonts.heading_800, 34, P.QR_CAPTION)
	_label("ChipWarning", fonts.mono_500, 20, P.WARNING)
	# Dispensing, on the lime background (DSP-05)
	_label("DisplayOnAccent", fonts.display_900, 113, P.ON_ACCENT, 96)
	_label("BodyOnAccent", fonts.body_600, 34, P.ON_ACCENT)
	_label("MonoOnAccent", fonts.mono_500, 22, P.ON_ACCENT)
	_label("MonoOnAccentSmall", fonts.mono_500, 20, P.ON_ACCENT)
	_label("FooterOnAccent", fonts.heading_800, 50, P.ON_ACCENT)
	_label("CollectText", fonts.display_900, 46, P.ON_ACCENT)
	_label("LogoTextInverse", fonts.display_900, 26, P.ACCENT)

	_panel("LogoTile", _box(P.ACCENT, 22))
	_panel("CardPanel", _box(P.SURFACE, P.RADIUS_CARD, 2, P.BORDER, 32))
	var popular := _box(P.SURFACE, P.RADIUS_CARD, 4, P.ACCENT, 32)
	popular.shadow_color = Color(P.ACCENT, 0.25)
	popular.shadow_size = 12
	_panel("CardPanelPopular", popular)
	_panel("HeroPanel", _box(P.SURFACE_RAISED, P.RADIUS_CARD))
	var badge := _box(P.ACCENT, 6)
	badge.set_content_margin(SIDE_LEFT, 12)
	badge.set_content_margin(SIDE_RIGHT, 12)
	badge.set_content_margin(SIDE_TOP, 6)
	badge.set_content_margin(SIDE_BOTTOM, 6)
	_panel("BadgePanel", badge)
	_panel("DiagPanel", _box(P.SURFACE, P.RADIUS_PANEL, 2, P.BORDER))
	_panel("FaultPanel", _box(P.WARNING_SURFACE, 12, 2, P.WARNING_BORDER, 28))
	var chip := _box(P.SURFACE_RAISED, 33, 2, P.BORDER)
	_margins(chip, 22, 14)
	_panel("ChipPanel", chip)
	var allergen := _box(P.WARNING, 20)
	_margins(allergen, 36, 30)
	_panel("AllergenPanel", allergen)
	_panel("AllergenIconPanel", _box(P.ON_ACCENT, 40))
	_panel("NutritionTilePanel", _box(P.SURFACE, P.RADIUS_PANEL, 2, P.BORDER, 24))
	_panel("LogoTileSmall", _box(P.ACCENT, 12))
	var qr := _box(P.QR_SURFACE, 36)
	_margins(qr, 48, 44)
	_panel("QrPanel", qr)
	var summary := _box(P.SURFACE, 20, 2, P.BORDER)
	_margins(summary, 36, 28)
	_panel("SummaryPanel", summary)
	var chip_warn := _box(P.WARNING_SURFACE, 8, 2, P.WARNING_BORDER)
	_margins(chip_warn, 12, 4)
	_panel("TestModeChip", chip_warn)
	_panel("LogoTileInverse", _box(P.ON_ACCENT, 12))

	theme.set_type_variation("DispenseProgress", "ProgressBar")
	theme.set_stylebox("background", "DispenseProgress", _box(P.ACCENT_TRACK, 14))
	theme.set_stylebox("fill", "DispenseProgress", _box(P.ON_ACCENT, 14))

	var primary := _box(P.ACCENT, P.RADIUS_CARD)
	var primary_pressed := _box(P.ACCENT.darkened(0.1), P.RADIUS_CARD)
	_button("PrimaryButton", fonts.display_900, 52, P.ON_ACCENT, primary, primary, primary_pressed)
	var ghost := _box(Color(0, 0, 0, 0), 24, 2, P.BORDER, 24)
	var ghost_pressed := _box(P.SURFACE_RAISED, 24, 2, P.BORDER, 24)
	_button("GhostButton", fonts.heading_800, 40, P.TEXT, ghost, ghost, ghost_pressed)
	var pill := _box(P.SURFACE_RAISED, 40, 2, P.BORDER)
	_margins(pill, 32, 0)
	var pill_pressed := _box(P.SURFACE, 40, 2, P.BORDER)
	_margins(pill_pressed, 32, 0)
	_button("BackPill", fonts.heading_800, 30, P.TEXT, pill, pill, pill_pressed)
	var ghost_m := _box(Color(0, 0, 0, 0), 20, 2, P.BORDER, 24)
	var ghost_m_pressed := _box(P.SURFACE_RAISED, 20, 2, P.BORDER, 24)
	_button("GhostButtonMuted", fonts.heading_800, 36, P.TEXT_MUTED, ghost_m, ghost_m, ghost_m_pressed)
	var primary_m := _box(P.ACCENT, 20)
	var primary_m_pressed := _box(P.ACCENT.darkened(0.1), 20)
	_button("PrimaryButtonM", fonts.display_900, 40, P.ON_ACCENT, primary_m, primary_m, primary_m_pressed)
	theme.set_stylebox("disabled", "PrimaryButtonM", _box(P.SURFACE_RAISED, 20, 2, P.BORDER))
	theme.set_color("font_disabled_color", "PrimaryButtonM", P.TEXT_DIM)

	var err := ResourceSaver.save(theme, THEME_PATH)
	print("theme saved: ", THEME_PATH, " err=", err)
	quit(0 if err == OK else 1)


func _variation(name: String, base: FontFile, axes: Dictionary, glyph_spacing: int = 0,
		fallbacks: Array[Font] = []) -> FontVariation:
	# variation_opentype keys MUST be integer tags; string keys are silently ignored.
	var ts := TextServerManager.get_primary_interface()
	var fv := FontVariation.new()
	fv.base_font = base
	var tagged := {}
	for axis in axes:
		tagged[ts.name_to_tag(axis)] = axes[axis]
	fv.variation_opentype = tagged
	fv.spacing_glyph = glyph_spacing
	fv.fallbacks = fallbacks
	var path := "%s/%s.tres" % [FONT_DIR, name]
	# The project theme (and so these fonts) is already cached when this runs:
	# take over the cached path instead of saving a conflicting second copy.
	fv.take_over_path(path)
	ResourceSaver.save(fv, path)
	return fv


func _label(name: String, font: Font, size: int, color: Color, line_pitch: int = 0) -> void:
	theme.set_type_variation(name, "Label")
	theme.set_font("font", name, font)
	theme.set_font_size("font_size", name, size)
	theme.set_color("font_color", name, color)
	if line_pitch > 0:
		theme.set_constant("line_spacing", name, line_pitch - int(round(font.get_height(size))))


func _panel(name: String, box: StyleBoxFlat) -> void:
	theme.set_type_variation(name, "PanelContainer")
	theme.set_stylebox("panel", name, box)


func _button(name: String, font: Font, size: int, color: Color, normal: StyleBox,
		hover: StyleBox, pressed: StyleBox) -> void:
	theme.set_type_variation(name, "Button")
	theme.set_font("font", name, font)
	theme.set_font_size("font_size", name, size)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color",
			"font_hover_pressed_color", "font_disabled_color"]:
		theme.set_color(key, name, color)
	theme.set_stylebox("normal", name, normal)
	theme.set_stylebox("hover", name, hover)
	theme.set_stylebox("pressed", name, pressed)
	theme.set_stylebox("hover_pressed", name, pressed)
	theme.set_stylebox("disabled", name, normal)
	theme.set_stylebox("focus", name, StyleBoxEmpty.new())


func _box(bg: Color, radius: int, border: int = 0, border_color: Color = Color.TRANSPARENT,
		margin: int = 0) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(radius)
	sb.corner_detail = 12
	sb.anti_aliasing = true
	if border > 0:
		sb.set_border_width_all(border)
		sb.border_color = border_color
	sb.set_content_margin_all(margin)
	return sb


func _margins(sb: StyleBoxFlat, horizontal: int, vertical: int) -> void:
	sb.set_content_margin(SIDE_LEFT, horizontal)
	sb.set_content_margin(SIDE_RIGHT, horizontal)
	sb.set_content_margin(SIDE_TOP, vertical)
	sb.set_content_margin(SIDE_BOTTOM, vertical)
