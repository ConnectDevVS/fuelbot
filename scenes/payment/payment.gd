extends Control
## TEMPORARY stub so Proceed to Pay lands somewhere real.
## Replaced by the payment story set (PDF page 4, plan Milestone 2).

const StepIndicatorScene := preload("res://ui/components/step_indicator/StepIndicator.tscn")

var _name: Label
var _price: Label
var _cancel: Button


func _ready() -> void:
	if not OrderState.has_selection() or OrderState.charged_price <= 0:
		Nav.go_idle.call_deferred()
		return
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, Palette.PAD)
	margin.add_theme_constant_override("margin_top", 48)
	margin.add_theme_constant_override("margin_bottom", 52)
	add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 32)
	margin.add_child(col)

	var step := StepIndicatorScene.instantiate()
	step.step = 2
	step.total = 2
	col.add_child(step)
	var title := Label.new()
	title.theme_type_variation = &"DisplayL"
	title.text = ConfigManager.get_message("payment_stub_title")
	col.add_child(title)
	_name = Label.new()
	_name.theme_type_variation = &"Heading"
	_name.text = String(OrderState.selected_flavor.get("name", ""))
	col.add_child(_name)
	_price = Label.new()
	_price.theme_type_variation = &"Price"
	_price.text = Fmt.rupees(OrderState.charged_price)
	col.add_child(_price)
	var body := Label.new()
	body.theme_type_variation = &"Body"
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.text = ConfigManager.get_message("payment_stub_body")
	col.add_child(body)
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(spacer)
	_cancel = Button.new()
	_cancel.theme_type_variation = &"GhostButton"
	_cancel.text = ConfigManager.get_message("payment_cancel")
	_cancel.custom_minimum_size.y = 130
	_cancel.focus_mode = Control.FOCUS_NONE
	_cancel.pressed.connect(Nav.go_idle)
	col.add_child(_cancel)

	var timer := Timer.new()
	timer.one_shot = true
	timer.wait_time = maxf(ConfigManager.get_timing("payment_stub_return_sec", 20.0), 0.05)
	timer.timeout.connect(Nav.go_idle)
	add_child(timer)
	timer.start()


func get_name_text() -> String:
	return _name.text if _name else ""


func get_price_text() -> String:
	return _price.text if _price else ""


func press_cancel() -> void:
	_cancel.pressed.emit()
