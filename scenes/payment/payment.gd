extends Control
## "Scan to pay" (PDF page 4). A small state machine over RazorpayManager signals,
## a wall-clock countdown (the QR expiry is this screen's timeout) and Cancel.
## The hopper goes to the bridge only after payment succeeds (plan §3.2).
## Deliberately does NOT check maintenance: idle is the only enforcement point.

enum State { CREATING, WAITING, PAID, FAILED, EXPIRED, CANCELLING }

const StepIndicatorScene := preload("res://ui/components/step_indicator/StepIndicator.tscn")

var state := State.CREATING
var _deadline_msec := 0
var _qr_texture: TextureRect
var _qr_message: Label
var _qr_dot: StatusDot
var _status_dot: StatusDot
var _status: Label
var _countdown: Label
var _cancel: Button
var _order_label: Label
var _chip: PanelContainer
var _chip_label: Label
var _return_timer: Timer


func _ready() -> void:
	if not OrderState.has_selection() or OrderState.charged_price <= 0 \
			or not Ulid.is_valid(OrderState.order_id):
		Nav.go_idle.call_deferred()
		return
	_build()
	RazorpayManager.qr_created.connect(_on_qr_created)
	RazorpayManager.qr_create_failed.connect(_on_qr_create_failed)
	RazorpayManager.payment_received.connect(_on_payment_received)
	RazorpayManager.payment_failed.connect(_on_payment_failed)
	var tick := Timer.new()
	tick.wait_time = 0.25
	tick.autostart = true
	tick.timeout.connect(_on_tick)
	add_child(tick)
	_return_timer = Timer.new()
	_return_timer.one_shot = true
	_return_timer.timeout.connect(Nav.go_idle)
	add_child(_return_timer)
	_enter(State.CREATING)
	RazorpayManager.create_qr(OrderState.charged_price, OrderState.order_id, OrderState.order_number,
		String(OrderState.selected_flavor.get("name", "")))


func _exit_tree() -> void:
	# Leaving by any path other than a successful payment abandons the QR.
	if state != State.PAID:
		RazorpayManager.abort()


# --- RazorpayManager signals ---------------------------------------------------

func _on_qr_created(_qr_id: String, image_path: String, _amount: int) -> void:
	if state != State.CREATING:
		return
	var image := Image.load_from_file(ProjectSettings.globalize_path(image_path))
	_qr_texture.texture = ImageTexture.create_from_image(image) if image else null
	_deadline_msec = Time.get_ticks_msec() + int(RazorpayManager.qr_expiry_sec * 1000)
	_enter(State.WAITING)


func _on_qr_create_failed(reason: String) -> void:
	if state != State.CREATING and state != State.CANCELLING:
		return
	var unavailable := reason in ["not_configured", "live_keys_disallowed"]
	push_warning("[Payment] QR create failed for order %s: %s" % [OrderState.order_id, reason])
	_fail("payment_unavailable" if unavailable else "payment_failed")


func _on_payment_received(payment_id: String, amount_paise: int) -> void:
	if state == State.PAID or state == State.FAILED or state == State.EXPIRED:
		return
	if amount_paise != OrderState.charged_price * 100:
		push_warning("[Payment] order %s captured %d paise, expected %d" % [
			OrderState.order_id, amount_paise, OrderState.charged_price * 100])
	OrderState.transaction_id = payment_id
	_enter(State.PAID)
	var base := ConfigManager.get_base(OrderState.selected_base_id)
	await Bridge.send_order_paid(int(OrderState.selected_flavor.get("hopper", 0)), String(base.get("code", "")))
	Nav.go(ScenePaths.DISPENSING)


func _on_payment_failed(reason: String) -> void:
	if state != State.WAITING:
		return
	if reason == "timeout":
		_expire()
	else:
		_fail("payment_failed")


func _on_tick() -> void:
	if state != State.WAITING:
		return
	var remaining := maxi(_deadline_msec - Time.get_ticks_msec(), 0)
	_countdown.text = _format_countdown(remaining)
	if remaining == 0:
		_expire()


# --- Transitions -------------------------------------------------------------

func _fail(message_key: String) -> void:
	_enter(State.FAILED, message_key)
	_cleanup_and_schedule_return()


func _expire() -> void:
	_enter(State.EXPIRED, "payment_timeout")
	_countdown.text = _format_countdown(0)
	_cleanup_and_schedule_return()


func _cleanup_and_schedule_return() -> void:
	RazorpayManager.abort()
	Bridge.send_order_cancelled()
	_return_timer.wait_time = maxf(ConfigManager.get_timing("payment_error_return_sec", 8.0), 0.05)
	_return_timer.start()


## Cancel race rule: a customer may pay in the same second they tap Cancel.
## Do one final check; if the payment is there, dispense instead of cancelling.
func _on_cancel_pressed() -> void:
	if state == State.FAILED or state == State.EXPIRED:
		Nav.go_idle()
		return
	if state != State.CREATING and state != State.WAITING:
		return
	var had_qr := RazorpayManager.current_qr_id() != ""
	_enter(State.CANCELLING)
	RazorpayManager.stop_polling()
	if had_qr:
		var checked := [false]
		var on_poll := func(_status: String) -> void: checked[0] = true
		RazorpayManager.poll_completed.connect(on_poll)
		RazorpayManager.check_now()
		var until := Time.get_ticks_msec() + int(ConfigManager.get_timing("payment_final_check_timeout_sec", 5.0) * 1000)
		while state == State.CANCELLING and not checked[0] and Time.get_ticks_msec() < until and is_inside_tree():
			await get_tree().process_frame
		RazorpayManager.poll_completed.disconnect(on_poll)
		await get_tree().process_frame  # let a captured result's handler run first
	if state != State.CANCELLING:
		return  # paid during the final check
	RazorpayManager.abort()
	Bridge.send_order_cancelled()
	Nav.go_idle()


func _enter(new_state: State, message_key: String = "") -> void:
	state = new_state
	_qr_texture.visible = new_state == State.WAITING or new_state == State.CANCELLING or new_state == State.PAID
	_qr_texture.modulate.a = 0.3 if new_state == State.PAID else 1.0
	_qr_message.visible = new_state != State.WAITING and new_state != State.CANCELLING
	_qr_dot.visible = new_state == State.CREATING
	_countdown.visible = new_state == State.WAITING or new_state == State.EXPIRED or new_state == State.CANCELLING
	_cancel.visible = new_state != State.PAID
	_cancel.disabled = new_state == State.CANCELLING
	var warn := new_state == State.FAILED or new_state == State.EXPIRED
	_status_dot.color = Palette.WARNING if warn else Palette.ACCENT
	_status_dot.pulse = new_state == State.CREATING or new_state == State.WAITING
	match new_state:
		State.CREATING:
			_qr_message.text = ConfigManager.get_message("qr_generating")
			_status.text = ConfigManager.get_message("payment_creating")
		State.WAITING:
			_status.text = ConfigManager.get_message("payment_waiting")
			_countdown.text = _format_countdown(_deadline_msec - Time.get_ticks_msec())
		State.PAID:
			_qr_message.text = ConfigManager.get_message("payment_received")
			_status.text = ConfigManager.get_message("payment_received")
		State.FAILED:
			_qr_message.text = ConfigManager.get_message(message_key)
			_status.text = ConfigManager.get_message("payment_failed_status")
		State.EXPIRED:
			_qr_message.text = ConfigManager.get_message(message_key)
			_status.text = ConfigManager.get_message("payment_expired_status")
		State.CANCELLING:
			_status.text = ConfigManager.get_message("payment_cancelling")


static func _format_countdown(msec: int) -> String:
	var total := int(ceil(maxi(msec, 0) / 1000.0))
	return "%d:%02d" % [total / 60, total % 60]


# --- Test/introspection helpers ----------------------------------------------

func get_state() -> State:
	return state


func get_order_text() -> String:
	return _order_label.text


func get_chip_text() -> String:
	return _chip_label.text if _chip.visible else ""


func get_countdown_text() -> String:
	return _countdown.text


func get_qr_message() -> String:
	return _qr_message.text


func has_qr_texture() -> bool:
	return _qr_texture.texture != null


func press_cancel() -> void:
	if not _cancel.disabled and _cancel.visible:
		_cancel.pressed.emit()


# --- Layout ------------------------------------------------------------------

func _build() -> void:
	var flavor := OrderState.selected_flavor
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var body := _margin(48, 0)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	body.add_child(col)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	col.add_child(header)
	var step := StepIndicatorScene.instantiate()
	step.step = 2
	step.total = 2
	header.add_child(step)
	header.add_child(_expander())
	_chip = PanelContainer.new()
	_chip.theme_type_variation = &"TestModeChip"
	_chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(_chip)
	_chip_label = _label(&"ChipWarning", "")
	_chip.add_child(_chip_label)
	match RazorpayManager.mode():
		"test":
			_chip_label.text = ConfigManager.get_message("payment_test_mode")
		"mock":
			_chip_label.text = ConfigManager.get_message("payment_mock_mode")
		_:
			_chip.visible = false
	_order_label = _label(&"StepText", ConfigManager.get_message("order_number",
		{"number": "%04d" % OrderState.order_number}))
	_order_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(_order_label)

	col.add_child(_gap(44))
	col.add_child(_label(&"DisplayS", ConfigManager.get_message("payment_title")))
	col.add_child(_gap(36))
	col.add_child(_build_summary(flavor))
	col.add_child(_gap(56))

	var center := CenterContainer.new()
	col.add_child(center)
	var qr_panel := PanelContainer.new()
	qr_panel.theme_type_variation = &"QrPanel"
	center.add_child(qr_panel)
	var qr_col := VBoxContainer.new()
	qr_col.add_theme_constant_override("separation", 20)
	qr_panel.add_child(qr_col)
	var qr_area := Control.new()
	qr_area.custom_minimum_size = Vector2(600, 600)
	qr_col.add_child(qr_area)
	_qr_texture = TextureRect.new()
	_qr_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_qr_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_qr_texture.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_qr_texture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	qr_area.add_child(_qr_texture)
	var msg_box := VBoxContainer.new()
	msg_box.alignment = BoxContainer.ALIGNMENT_CENTER
	msg_box.add_theme_constant_override("separation", 24)
	msg_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	qr_area.add_child(msg_box)
	var dot_center := CenterContainer.new()
	msg_box.add_child(dot_center)
	_qr_dot = StatusDot.new()
	_qr_dot.color = Palette.QR_CAPTION
	_qr_dot.diameter = 28
	_qr_dot.pulse = true
	dot_center.add_child(_qr_dot)
	_qr_message = _label(&"QrMessage", "")
	_qr_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_qr_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_qr_message.custom_minimum_size.x = 520
	msg_box.add_child(_qr_message)
	var caption := _label(&"QrCaption", ConfigManager.get_message("payment_qr_caption"))
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	qr_col.add_child(caption)

	col.add_child(_gap(44))
	var status_center := CenterContainer.new()
	col.add_child(status_center)
	var status_row := HBoxContainer.new()
	status_row.add_theme_constant_override("separation", 20)
	status_center.add_child(status_row)
	_status_dot = StatusDot.new()
	_status_dot.diameter = 22
	status_row.add_child(_status_dot)
	_status = _label(&"StatusText", "")
	status_row.add_child(_status)
	_countdown = _label(&"Countdown", "")
	_countdown.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	status_row.add_child(_countdown)
	col.add_child(_gap(18))
	var hint := _label(&"BodySmall", ConfigManager.get_message("payment_hint"))
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(hint)

	var bar := _margin(0, 52)
	root.add_child(bar)
	_cancel = Button.new()
	_cancel.name = "Cancel"
	_cancel.theme_type_variation = &"GhostButton"
	_cancel.text = ConfigManager.get_message("payment_cancel")
	_cancel.custom_minimum_size.y = 126
	_cancel.focus_mode = Control.FOCUS_NONE
	_cancel.pressed.connect(_on_cancel_pressed)
	bar.add_child(_cancel)


func _build_summary(flavor: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.theme_type_variation = &"SummaryPanel"
	panel.custom_minimum_size.y = 165
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 32)
	panel.add_child(row)
	var image := TextureRect.new()
	image.custom_minimum_size = Vector2(72, 100)
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	var path: String = flavor.get("image", "")
	image.texture = load(path) if path != "" and ResourceLoader.exists(path) else null
	row.add_child(image)
	var names := VBoxContainer.new()
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(names)
	var name_label := _label(&"Heading", String(flavor.get("name", "")))
	name_label.clip_text = true
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	names.add_child(name_label)
	var volume := int(flavor.get("volume_ml", 0))
	if volume > 0:
		names.add_child(_label(&"Mono", ConfigManager.get_message("payment_summary_meta", {"volume_ml": volume})))
	var price := _label(&"Price", Fmt.rupees(OrderState.charged_price))
	price.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(price)
	return panel


func _label(variation: StringName, text: String) -> Label:
	var l := Label.new()
	l.theme_type_variation = variation
	l.text = text
	return l


func _margin(top: int, bottom: int) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", Palette.PAD)
	m.add_theme_constant_override("margin_right", Palette.PAD)
	m.add_theme_constant_override("margin_top", top)
	m.add_theme_constant_override("margin_bottom", bottom)
	return m


func _gap(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _expander() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c
