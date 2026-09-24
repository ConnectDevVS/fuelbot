extends Control
## TEMPORARY stub after a successful payment. Replaced by the dispensing screen
## (PDF page 5, plan Milestone 4: DONE/TIMEOUT from the bridge on UDP 4245).

var _name: Label
var _order: Label


func _ready() -> void:
	if OrderState.transaction_id == "":
		Nav.go_idle.call_deferred()
		return
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
	col.add_theme_constant_override("separation", 32)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	margin.add_child(col)
	var title := Label.new()
	title.theme_type_variation = &"DisplayL"
	title.text = ConfigManager.get_message("dispensing_stub_title")
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(title)
	_name = Label.new()
	_name.theme_type_variation = &"Heading"
	_name.text = String(OrderState.selected_flavor.get("name", ""))
	col.add_child(_name)
	_order = Label.new()
	_order.theme_type_variation = &"StepText"
	_order.text = ConfigManager.get_message("order_number", {"number": "%04d" % OrderState.order_number})
	col.add_child(_order)
	var body := Label.new()
	body.theme_type_variation = &"Body"
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.text = ConfigManager.get_message("dispensing_stub_body")
	col.add_child(body)
	var timer := Timer.new()
	timer.one_shot = true
	timer.wait_time = maxf(ConfigManager.get_timing("dispensing_stub_return_sec", 10.0), 0.05)
	timer.timeout.connect(Nav.go_idle)
	add_child(timer)
	timer.start()


func get_name_text() -> String:
	return _name.text if _name else ""


func get_order_text() -> String:
	return _order.text if _order else ""
