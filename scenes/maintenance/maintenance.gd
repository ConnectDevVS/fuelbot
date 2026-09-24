extends Control
## Out-of-service screen with technician diagnostics (PDF page 6). No interaction.
## Returns to idle when ConfigManager reports maintenance has cleared.

const CELLS := ["diag_machine_id", "diag_site", "diag_flagged_by", "diag_flagged_at",
	"diag_firmware", "diag_network", "diag_last_heartbeat", "diag_payments"]

var _clock: Label
var _message: Label
var _values := {}
var _faults_panel: PanelContainer
var _faults_title: Label
var _faults_list: VBoxContainer
var _service: Label


func _ready() -> void:
	_build()
	ConfigManager.maintenance_changed.connect(_on_maintenance_changed)
	ConfigManager.connectivity_changed.connect(func(_o: bool) -> void: _render_live())
	var timer := Timer.new()
	timer.wait_time = 1.0
	timer.autostart = true
	timer.timeout.connect(_render_live)
	add_child(timer)
	_render()
	# The flag can clear between idle's redirect and this scene connecting to
	# maintenance_changed (e.g. a fast boot fetch overriding a cached flag).
	if not ConfigManager.is_in_maintenance():
		Nav.go_idle.call_deferred()


func _on_maintenance_changed(enabled: bool, _message_text: String) -> void:
	if not enabled:
		Nav.go_idle()
	else:
		_render()


func get_message_text() -> String:
	return _message.text


func get_cell_value(key: String) -> String:
	return _values[key].text


func get_fault_lines() -> PackedStringArray:
	var lines: PackedStringArray = []
	for child in _faults_list.get_children():
		lines.append(child.text)
	return lines


func is_faults_visible() -> bool:
	return _faults_panel.visible


func _render() -> void:
	var info := ConfigManager.get_maintenance_info()
	var tenant := ConfigManager.get_tenant()
	var unknown := ConfigManager.get_message("diag_unknown")
	_message.text = info.message
	_values.diag_machine_id.text = ConfigManager.tenant_id if ConfigManager.tenant_id != "" else unknown
	_values.diag_site.text = tenant.get("site", "") if tenant.get("site", "") != "" else unknown
	_values.diag_flagged_by.text = info.flagged_by if info.flagged_by != "" else unknown
	var v := Engine.get_version_info()
	_values.diag_firmware.text = "%s (godot %d.%d.%d)" % [
		ProjectSettings.get_setting("application/config/version", "0.0.0"), v.major, v.minor, v.patch]
	_values.diag_payments.text = ConfigManager.get_message("maintenance_payments_disabled")

	var faults: Array = info.faults
	_faults_panel.visible = not faults.is_empty()
	_faults_title.text = ConfigManager.get_message("maintenance_faults_title", {"count": faults.size()})
	for child in _faults_list.get_children():
		child.queue_free()
		_faults_list.remove_child(child)
	for fault in faults:
		var line := Label.new()
		line.theme_type_variation = &"MonoValue"
		line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		line.text = "%s · %s" % [fault.get("code", ""), fault.get("description", "")]
		_faults_list.add_child(line)

	var phone: String = tenant.get("support_phone", "")
	_service.visible = phone != ""
	_service.text = ConfigManager.get_message("maintenance_service", {"phone": phone})
	_render_live()


## Values that change with time: clock, flagged-at "ago", network, heartbeat.
func _render_live() -> void:
	var now := Time.get_unix_time_from_system()
	var unknown := ConfigManager.get_message("diag_unknown")
	_clock.text = Fmt.datetime_short(now)
	var flagged := Fmt.iso_to_unix(ConfigManager.get_maintenance_info().flagged_at)
	_values.diag_flagged_at.text = unknown if flagged == 0.0 else \
		"%s · %s" % [Fmt.time_short(flagged), Fmt.ago(now - flagged)]
	var online := ConfigManager.is_online
	var net: Label = _values.diag_network
	net.text = ConfigManager.get_message("maintenance_network_online" if online else "maintenance_network_offline")
	net.add_theme_color_override("font_color", Palette.SUCCESS if online else Palette.WARNING)
	var beat := ConfigManager.last_successful_fetch_unix
	_values.diag_last_heartbeat.text = ConfigManager.get_message("diag_never") if beat == 0.0 else Fmt.ago(now - beat)


# --- Layout ------------------------------------------------------------------

func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var stripe := HazardStripe.new()
	stripe.name = "HazardStripe"
	stripe.custom_minimum_size.y = 28
	root.add_child(stripe)

	var margin := MarginContainer.new()
	margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_theme_constant_override("margin_left", Palette.PAD)
	margin.add_theme_constant_override("margin_right", Palette.PAD)
	margin.add_theme_constant_override("margin_top", 68)
	root.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	margin.add_child(col)

	var header := HBoxContainer.new()
	col.add_child(header)
	header.add_child(_label("Mono", ConfigManager.get_message("maintenance_header")))
	header.add_child(_expander())
	_clock = _label("Mono", "")
	header.add_child(_clock)

	col.add_child(_gap(90))
	var status := HBoxContainer.new()
	status.add_theme_constant_override("separation", 18)
	col.add_child(status)
	var dot := StatusDot.new()
	dot.color = Palette.WARNING
	dot.diameter = 22
	dot.pulse = true
	status.add_child(dot)
	status.add_child(_label("MonoWarning", ConfigManager.get_message("maintenance_status")))

	col.add_child(_gap(24))
	col.add_child(_label("DisplayXL", ConfigManager.get_message("maintenance_title")))

	col.add_child(_gap(36))
	_message = _label("Body", "")
	_message.name = "Message"
	_message.add_theme_font_size_override("font_size", 40)
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_message)

	col.add_child(_gap(64))
	col.add_child(_build_diagnostics())

	col.add_child(_gap(36))
	_faults_panel = PanelContainer.new()
	_faults_panel.name = "Faults"
	_faults_panel.theme_type_variation = &"FaultPanel"
	col.add_child(_faults_panel)
	var faults_col := VBoxContainer.new()
	faults_col.add_theme_constant_override("separation", 14)
	_faults_panel.add_child(faults_col)
	_faults_title = _label("MonoWarning", "")
	faults_col.add_child(_faults_title)
	_faults_list = VBoxContainer.new()
	_faults_list.add_theme_constant_override("separation", 10)
	faults_col.add_child(_faults_list)

	root.add_child(_hline())
	var footer := MarginContainer.new()
	footer.add_theme_constant_override("margin_left", Palette.PAD)
	footer.add_theme_constant_override("margin_right", Palette.PAD)
	footer.add_theme_constant_override("margin_top", 36)
	footer.add_theme_constant_override("margin_bottom", 36)
	root.add_child(footer)
	var footer_row := HBoxContainer.new()
	footer.add_child(footer_row)
	_service = _label("MonoMuted", "")
	footer_row.add_child(_service)
	footer_row.add_child(_expander())
	footer_row.add_child(_label("Mono", ConfigManager.get_message("maintenance_exit_hint")))


func _build_diagnostics() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = "Diagnostics"
	panel.theme_type_variation = &"DiagPanel"
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 0)
	panel.add_child(rows)
	rows.add_child(_padded(_label("MonoMuted", ConfigManager.get_message("maintenance_diagnostics_title"))))
	for r in range(0, CELLS.size(), 2):
		rows.add_child(_hline())
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 0)
		rows.add_child(row)
		row.add_child(_cell(CELLS[r]))
		var vline := ColorRect.new()
		vline.color = Palette.BORDER
		vline.custom_minimum_size.x = 2
		row.add_child(vline)
		row.add_child(_cell(CELLS[r + 1]))
	return panel


func _cell(key: String) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.add_child(_label("Mono", ConfigManager.get_message(key)))
	var value := _label("MonoValue", "")
	value.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(value)
	_values[key] = value
	var padded := _padded(box)
	padded.name = "Cell_" + key
	padded.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	padded.size_flags_stretch_ratio = 1.0
	return padded


func _padded(child: Control) -> MarginContainer:
	var m := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 28)
	m.add_child(child)
	return m


func _label(variation: StringName, text: String) -> Label:
	var l := Label.new()
	l.theme_type_variation = variation
	l.text = text
	return l


func _hline() -> ColorRect:
	var line := ColorRect.new()
	line.color = Palette.BORDER
	line.custom_minimum_size.y = 2
	return line


func _gap(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _expander() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c
