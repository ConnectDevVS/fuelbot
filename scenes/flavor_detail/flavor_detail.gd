extends Control
## TEMPORARY stub so a tap on the listing lands somewhere real.
## Replaced by the Ingredients & Allergens story (PDF page 3).

var _name: Label
var _back: Button


func _ready() -> void:
	if not OrderState.has_selection():
		Nav.go_idle.call_deferred()
		return
	var flavor := OrderState.selected_flavor
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, Palette.PAD)
	add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 36)
	margin.add_child(col)

	var back := Button.new()
	_back = back
	back.name = "Back"
	back.theme_type_variation = &"GhostButton"
	back.text = "←  " + ConfigManager.get_message("back")
	back.custom_minimum_size = Vector2(240, 96)
	back.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	back.pressed.connect(func() -> void: Nav.go(ScenePaths.FLAVOR_SELECT))
	col.add_child(back)

	_name = Label.new()
	_name.name = "Name"
	_name.theme_type_variation = &"DisplayL"
	_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_name.text = String(flavor.get("name", ""))
	col.add_child(_name)
	var price := Label.new()
	price.theme_type_variation = &"Price"
	price.text = Fmt.rupees(ConfigManager.get_charge_price(flavor))
	col.add_child(price)
	var title := Label.new()
	title.theme_type_variation = &"Heading"
	title.text = ConfigManager.get_message("detail_stub_title")
	col.add_child(title)
	var body := Label.new()
	body.theme_type_variation = &"Body"
	body.text = ConfigManager.get_message("detail_stub_body")
	col.add_child(body)

	var timer := Timer.new()
	timer.one_shot = true
	timer.wait_time = maxf(ConfigManager.get_timing("detail_stub_return_sec", 10.0), 0.05)
	timer.timeout.connect(Nav.go_idle)
	add_child(timer)
	timer.start()


func get_name_text() -> String:
	return _name.text if _name else ""


func press_back() -> void:
	_back.pressed.emit()
