extends Control
## "Thank You / Dispensing" (PDF page 5): one screen for blending, done and failed
## (dispensing README decision 3). Reacts to the bridge's DONE / TIMEOUT / REJECTED
## for this order (Bridge caches results, so one that arrived before this scene
## loaded still counts), with a wall-clock safety cap if nothing arrives.
## Deliberately does NOT check maintenance: idle is the only enforcement point.

enum State { BLENDING, DONE, FAILED }

const StatusBadgeScene := preload("res://ui/components/status_badge/StatusBadge.tscn")
const HintArrowScene := preload("res://ui/components/hint_arrow/HintArrow.tscn")
const COLUMN_WIDTH := 762

var state := State.BLENDING
var _start_msec := 0
var _return_at_msec := 0
var _left := false
var _progress_value := 0.0
var _badge: StatusBadge
var _title: Label
var _meta: Label
var _bar_box: VBoxContainer
var _bar: ProgressBar
var _bar_left: Label
var _bar_right: Label
var _collect: VBoxContainer
var _footer: Label
var _return_label: Label
var _order_label: Label
var _paid_label: Label


func _ready() -> void:
	if OrderState.transaction_id == "" or not Ulid.is_valid(OrderState.order_id):
		Nav.go_idle.call_deferred()
		set_process(false)
		return
	_build()
	_start_msec = Time.get_ticks_msec()
	_enter(State.BLENDING)
	var cached := Bridge.get_result(OrderState.order_id)
	if not cached.is_empty():
		_on_result(OrderState.order_id, cached.kind, cached.reason)
	Bridge.result_received.connect(_on_result)


func _process(_delta: float) -> void:
	var now := Time.get_ticks_msec()
	match state:
		State.BLENDING:
			var elapsed := (now - _start_msec) / 1000.0
			var expected := ConfigManager.get_timing("dispense_expected_sec", 75.0)
			_set_progress(estimate_progress(elapsed, expected))
			var remaining := int(ceil(expected - elapsed))
			_bar_right.text = ConfigManager.get_message("dispensing_remaining", {"seconds": remaining}) \
				if remaining >= 1 else ConfigManager.get_message("dispensing_almost")
			if elapsed >= ConfigManager.get_timing("dispense_safety_cap_sec", 130.0):
				push_warning("[Dispensing] order %s: no result within the safety cap" % OrderState.order_id)
				# The bridge never answered, so it can't report this cycle: the app does (TEL-05).
				TelemetryReporter.report_event({"v": 1, "event_type": "dispense_cycle",
					"order_id": OrderState.order_id, "hopper": int(OrderState.selected_flavor.get("hopper", 0)),
					"result": "NO_RESPONSE", "reason": "safety_cap", "stages": [], "fault": null,
					"duration_ms": int(elapsed * 1000)}, "app")
				_report_sale("no_response", "safety_cap")
				_enter(State.FAILED)
		State.DONE, State.FAILED:
			var left_sec := maxi(_return_at_msec - now, 0) / 1000.0
			_return_label.text = ConfigManager.get_message("dispensing_returning",
				{"seconds": int(ceil(left_sec))})
			if left_sec <= 0.0 and not _left:
				_left = true
				Nav.go_idle()


## Bar fill for `elapsed` seconds into a cycle expected to take `expected` seconds:
## linear to 95% at `expected`, then creeping toward (never reaching) 99%.
static func estimate_progress(elapsed: float, expected: float) -> float:
	if expected <= 0.0:
		return 0.95
	if elapsed <= expected:
		return 0.95 * maxf(elapsed, 0.0) / expected
	return 0.95 + 0.04 * (1.0 - exp(-(elapsed - expected) / expected))


func _on_result(order_id: String, kind: String, reason: String) -> void:
	if order_id != OrderState.order_id or state != State.BLENDING:
		return
	if kind == "DONE":
		_report_sale("success", "")
		_enter(State.DONE)
	else:
		push_warning("[Dispensing] order %s %s %s" % [order_id, kind, reason])
		_report_sale("timeout" if kind == "TIMEOUT" else "rejected", reason)
		_enter(State.FAILED)


## The order was paid: record the sale now that the outcome is known (SAL-03), before the
## return to idle resets OrderState. SalesReporter ignores a repeat for the same order.
func _report_sale(result: String, reason: String) -> void:
	SalesReporter.report_sale(SalesReporter.sale_from_order_state(result, reason))


func _enter(new_state: State) -> void:
	state = new_state
	var flavor := OrderState.selected_flavor
	_badge.mark = StatusBadge.Mark.ALERT if new_state == State.FAILED else StatusBadge.Mark.CHECK
	_bar_box.visible = new_state != State.FAILED
	_collect.visible = new_state == State.DONE
	_footer.visible = new_state != State.FAILED
	_return_label.modulate.a = 0.0 if new_state == State.BLENDING else 1.0
	match new_state:
		State.BLENDING:
			_title.text = ConfigManager.get_message("dispensing_title")
			_meta.text = _meta_text(flavor)
			_bar_left.text = ConfigManager.get_message("dispensing_progress_label")
		State.DONE:
			_title.text = ConfigManager.get_message("dispensing_success")
			_set_progress(1.0)
			_bar_left.text = ConfigManager.get_message("dispensing_ready_label")
			_bar_right.text = ""
			_start_return("dispensing_done_return_sec", 6.0)
		State.FAILED:
			_title.text = ConfigManager.get_message("dispensing_failed_title")
			_meta.text = ConfigManager.get_message("dispensing_timeout")
			_start_return("dispensing_error_return_sec", 10.0)


func _start_return(timing_key: String, fallback: float) -> void:
	var sec := maxf(ConfigManager.get_timing(timing_key, fallback), 0.05)
	_return_at_msec = Time.get_ticks_msec() + int(sec * 1000)
	_return_label.text = ConfigManager.get_message("dispensing_returning", {"seconds": int(ceil(sec))})


func _set_progress(value: float) -> void:
	_progress_value = value
	_bar.value = value


func _meta_text(flavor: Dictionary) -> String:
	var flavor_name := String(flavor.get("name", ""))
	var volume := int(flavor.get("volume_ml", 0))
	if volume <= 0:
		return flavor_name
	return ConfigManager.get_message("dispensing_meta", {"name": flavor_name, "volume_ml": volume})


# --- Test/introspection helpers ----------------------------------------------

func get_state() -> State:
	return state


func get_progress() -> float:
	return _progress_value


func get_title_text() -> String:
	return _title.text


func get_meta_text() -> String:
	return _meta.text


func get_remaining_text() -> String:
	return _bar_right.text if _bar_box.visible else ""


func get_return_text() -> String:
	return _return_label.text if _return_label.modulate.a > 0.0 else ""


func get_header_texts() -> Array:
	return [_order_label.text, _paid_label.text]


func is_collect_visible() -> bool:
	return _collect.visible


func is_bar_visible() -> bool:
	return _bar_box.visible


func get_badge_mark() -> StatusBadge.Mark:
	return _badge.mark


func get_title_line_count() -> int:
	return _title.get_line_count()


## Controls worth checking against the 1080×1920 frame.
func get_layout_controls() -> Array:
	return [_badge, _title, _meta, _bar, _bar_left, _bar_right, _collect, _footer, _return_label,
		_order_label, _paid_label]


func get_bar_size() -> Vector2:
	return _bar.size


func get_collect_size() -> Vector2:
	return _collect.size


# --- Layout (PDF page 5 measurements in the dispensing README) -----------------

func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.ACCENT
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var header_margin := MarginContainer.new()
	for side in ["left", "right"]:
		header_margin.add_theme_constant_override("margin_" + side, 62)
	header_margin.add_theme_constant_override("margin_top", 52)
	root.add_child(header_margin)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 20)
	header_margin.add_child(header)
	var tile := PanelContainer.new()
	tile.theme_type_variation = &"LogoTileInverse"
	tile.custom_minimum_size = Vector2(66, 66)
	header.add_child(tile)
	var logo := _label(&"LogoTextInverse", String(ConfigManager.get_tenant().get("logo_text", "")))
	logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	logo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	tile.add_child(logo)
	_order_label = _label(&"MonoOnAccentSmall", ConfigManager.get_message("dispensing_order_paid",
		{"number": "%04d" % OrderState.order_number}))
	_order_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(_order_label)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)
	_paid_label = _label(&"MonoOnAccentSmall", ConfigManager.get_message("dispensing_paid_via",
		{"price": Fmt.rupees(OrderState.charged_price)}))
	_paid_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(_paid_label)

	root.add_child(_expander())

	var middle := CenterContainer.new()
	root.add_child(middle)
	var col := VBoxContainer.new()
	col.custom_minimum_size.x = COLUMN_WIDTH
	col.add_theme_constant_override("separation", 0)
	middle.add_child(col)
	var badge_center := CenterContainer.new()
	col.add_child(badge_center)
	_badge = StatusBadgeScene.instantiate()
	badge_center.add_child(_badge)
	col.add_child(_gap(36))
	_title = _label(&"DisplayOnAccent", "")
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_title)
	col.add_child(_gap(30))
	_meta = _label(&"BodyOnAccent", "")
	_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_meta.custom_minimum_size.x = COLUMN_WIDTH
	_meta.size_flags_horizontal = Control.SIZE_SHRINK_CENTER  # a wide title mustn't widen the column
	col.add_child(_meta)
	col.add_child(_gap(40))
	_bar_box = VBoxContainer.new()
	_bar_box.add_theme_constant_override("separation", 20)
	_bar_box.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(_bar_box)
	_bar = ProgressBar.new()
	_bar.theme_type_variation = &"DispenseProgress"
	_bar.min_value = 0.0
	_bar.max_value = 1.0
	_bar.step = 0.0
	_bar.show_percentage = false
	_bar.custom_minimum_size = Vector2(COLUMN_WIDTH, 28)
	_bar_box.add_child(_bar)
	var labels := HBoxContainer.new()
	_bar_box.add_child(labels)
	_bar_left = _label(&"MonoOnAccent", "")
	labels.add_child(_bar_left)
	labels.add_child(_expander_h())
	_bar_right = _label(&"MonoOnAccent", "")
	labels.add_child(_bar_right)
	col.add_child(_gap(62))
	# An instruction, not a button: plain text + a bobbing arrow towards the hatch
	# (the design's filled pill read as tappable). Its slot is reserved while
	# blending, so DONE doesn't shift the layout.
	var collect_slot := CenterContainer.new()
	collect_slot.custom_minimum_size.y = 150
	col.add_child(collect_slot)
	_collect = VBoxContainer.new()
	_collect.add_theme_constant_override("separation", 14)
	collect_slot.add_child(_collect)
	var collect := _label(&"CollectText", ConfigManager.get_message("dispensing_collect"))
	collect.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_collect.add_child(collect)
	var arrow_center := CenterContainer.new()
	_collect.add_child(arrow_center)
	arrow_center.add_child(HintArrowScene.instantiate())

	root.add_child(_expander())

	var bottom := VBoxContainer.new()
	bottom.add_theme_constant_override("separation", 30)
	root.add_child(bottom)
	_footer = _label(&"FooterOnAccent", ConfigManager.get_message("dispensing_footer"))
	_footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bottom.add_child(_footer)
	_return_label = _label(&"MonoOnAccent", "")
	_return_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bottom.add_child(_return_label)
	root.add_child(_gap(70))


func _label(variation: StringName, text: String) -> Label:
	var l := Label.new()
	l.theme_type_variation = variation
	l.text = text
	return l


func _gap(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _expander() -> Control:
	var c := Control.new()
	c.size_flags_vertical = Control.SIZE_EXPAND_FILL
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _expander_h() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c
