extends Control
## Attract loop, "Tap Anywhere To Start" (PDF page 1). The app's main scene.
## This is the ONLY place that redirects to maintenance (plan §3.11): an order in
## progress is never interrupted; the flag takes effect once flow returns here.

const BrandHeaderScene := preload("res://ui/components/brand_header/BrandHeader.tscn")
const DEFAULT_VIDEO := "res://assets/video/idle_ad_default.ogv"

@export var video_path_override := ""

var video: VideoStreamPlayer
var _frame: Control
var _fallback: CenterContainer
var _subline: Label
var _entered_msec := 0
var _leaving := false
var _fit_attempts := 0


func _ready() -> void:
	_entered_msec = Time.get_ticks_msec()
	OrderState.reset()
	_build()
	_update_subline()
	ConfigManager.config_ready.connect(func(_c: Dictionary) -> void: _update_subline())
	ConfigManager.maintenance_changed.connect(_on_maintenance_changed)
	if ConfigManager.is_in_maintenance():
		_leaving = true
		Nav.go.call_deferred(ScenePaths.MAINTENANCE)
		return
	video.finished.connect(_play_video)
	_frame.resized.connect(_fit_video)
	_play_video()


func _exit_tree() -> void:
	_stop_video()


func _input(event: InputEvent) -> void:
	var released: bool = (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT \
		and not event.pressed) or (event is InputEventScreenTouch and not event.pressed)
	if not released or _leaving:
		return
	var debounce_msec := int(ConfigManager.get_timing("attract_tap_debounce_sec", 0.5) * 1000)
	if Time.get_ticks_msec() - _entered_msec < debounce_msec:
		return
	_start()


func _start() -> void:
	_leaving = true
	_stop_video()
	Nav.go(ScenePaths.FLAVOR_SELECT)


func _on_maintenance_changed(enabled: bool, _message: String) -> void:
	if enabled and not _leaving:
		_leaving = true
		_stop_video()
		Nav.go(ScenePaths.MAINTENANCE)


func _update_subline() -> void:
	var n := ConfigManager.get_flavors().filter(ConfigManager.is_orderable).size()
	_subline.visible = n > 0
	_subline.text = ConfigManager.get_message("attract_subline", {
		"count_word": Fmt.count_word(n),
		"min_price": Fmt.rupees(ConfigManager.get_min_charge_price()),
	})


# --- Video (plan §3.13, bundled tier) ----------------------------------------

## The user://idle_video_cache/ tiers from plan §3.13 plug in here later.
func _resolve_video_path() -> String:
	return video_path_override if video_path_override != "" else DEFAULT_VIDEO


## Re-resolves the path on every loop (VideoStreamPlayer has no loop flag).
func _play_video() -> void:
	if _leaving:
		return
	var path := _resolve_video_path()
	if not FileAccess.file_exists(path):
		_show_fallback()
		return
	var stream := VideoStreamTheora.new()
	stream.file = path
	video.stream = stream
	video.play()
	_fit_attempts = 0
	_fit_video.call_deferred()
	await get_tree().process_frame
	if is_inside_tree() and not _leaving and not video.is_playing():
		_show_fallback()


func _stop_video() -> void:
	if video and video.is_playing():
		video.stop()


func _show_fallback() -> void:
	video.visible = false
	_fallback.visible = true


## Cover-fit: scale the video to fill the hero frame, cropping overflow.
func _fit_video() -> void:
	var tex := video.get_video_texture()
	if tex == null or tex.get_size() == Vector2.ZERO:
		_fit_attempts += 1
		if _fit_attempts <= 10 and is_inside_tree():
			await get_tree().process_frame
			_fit_video()
		return
	var src := tex.get_size()
	var s := maxf(_frame.size.x / src.x, _frame.size.y / src.y)
	video.size = src * s
	video.position = (_frame.size - video.size) / 2.0


# --- Layout ------------------------------------------------------------------

func _build() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_theme_constant_override("margin_left", Palette.PAD)
	margin.add_theme_constant_override("margin_right", Palette.PAD)
	margin.add_theme_constant_override("margin_top", 60)
	margin.add_theme_constant_override("margin_bottom", 64)
	add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(col)

	col.add_child(BrandHeaderScene.instantiate())
	col.add_child(_gap(64))

	var hero := PanelContainer.new()
	hero.name = "Hero"
	hero.theme_type_variation = &"HeroPanel"
	hero.custom_minimum_size.y = 640
	hero.clip_children = CanvasItem.CLIP_CHILDREN_ONLY
	hero.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(hero)
	_frame = Control.new()
	_frame.name = "VideoFrame"
	_frame.clip_contents = true
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hero.add_child(_frame)
	video = VideoStreamPlayer.new()
	video.name = "Video"
	video.expand = true
	video.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(video)
	_fallback = CenterContainer.new()
	_fallback.name = "Fallback"
	_fallback.visible = false
	_fallback.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_fallback)
	var tile := PanelContainer.new()
	tile.theme_type_variation = &"LogoTile"
	tile.custom_minimum_size = Vector2(240, 240)
	_fallback.add_child(tile)
	var logo := Label.new()
	logo.theme_type_variation = &"LogoText"
	logo.add_theme_font_size_override("font_size", 110)
	logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	logo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	logo.text = String(ConfigManager.get_tenant().get("logo_text", ""))
	tile.add_child(logo)

	col.add_child(_gap(64))
	var headline := Label.new()
	headline.name = "Headline"
	headline.theme_type_variation = &"DisplayXL"
	headline.text = ConfigManager.get_message("attract_headline")
	col.add_child(headline)
	col.add_child(_gap(28))
	_subline = Label.new()
	_subline.name = "Subline"
	_subline.theme_type_variation = &"Body"
	_subline.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_subline)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(spacer)

	var cta := Button.new()
	cta.name = "Cta"
	cta.theme_type_variation = &"PrimaryButton"
	cta.custom_minimum_size.y = 172
	cta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cta.focus_mode = Control.FOCUS_NONE
	col.add_child(cta)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cta.add_child(center)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(row)
	var dot := StatusDot.new()
	dot.color = Palette.ON_ACCENT_FAINT
	dot.diameter = 22
	dot.pulse = true
	row.add_child(dot)
	var cta_label := Label.new()
	cta_label.theme_type_variation = &"ButtonText"
	cta_label.text = ConfigManager.get_message("attract_cta")
	row.add_child(cta_label)

	col.add_child(_gap(40))
	var footer := Label.new()
	footer.theme_type_variation = &"Mono"
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.text = ConfigManager.get_message("attract_footer")
	col.add_child(footer)


func _gap(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func is_fallback_visible() -> bool:
	return _fallback.visible


func get_subline_text() -> String:
	return _subline.text
