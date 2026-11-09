extends HBoxContainer
## Tenant logo tile + name + location, with a status or clock on the right.

const ConnectivityStatusScene := preload("res://ui/components/connectivity_status/ConnectivityStatus.tscn")

@export_enum("status", "clock") var right_mode := "status"

var _logo: Label
var _name: Label
var _location: Label
var _clock: Label


func _init() -> void:
	add_theme_constant_override("separation", 28)
	custom_minimum_size.y = 104
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var tile := PanelContainer.new()
	tile.name = "LogoTile"
	tile.theme_type_variation = &"LogoTile"
	tile.custom_minimum_size = Vector2(104, 104)
	tile.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	add_child(tile)
	_logo = Label.new()
	_logo.name = "LogoText"
	_logo.theme_type_variation = &"LogoText"
	_logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_logo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	tile.add_child(_logo)

	var names := VBoxContainer.new()
	names.add_theme_constant_override("separation", 4)
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(names)
	_name = Label.new()
	_name.name = "TenantName"
	_name.theme_type_variation = &"Heading"
	names.add_child(_name)
	_location = Label.new()
	_location.name = "Location"
	_location.theme_type_variation = &"Mono"
	names.add_child(_location)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(spacer)


func _ready() -> void:
	if right_mode == "clock":
		_clock = Label.new()
		_clock.name = "Clock"
		_clock.theme_type_variation = &"Clock"
		_clock.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		add_child(_clock)
		var timer := Timer.new()
		timer.wait_time = 1.0
		timer.autostart = true
		timer.timeout.connect(_update_clock)
		add_child(timer)
		_update_clock()
	else:
		var status := ConnectivityStatusScene.instantiate()
		status.name = "Status"
		status.ready_key = "status_ready"
		status.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		add_child(status)
	ConfigManager.config_ready.connect(func(_c: Dictionary) -> void: _update_tenant())
	_update_tenant()


func _update_tenant() -> void:
	var tenant := ConfigManager.get_tenant()
	_logo.text = String(tenant.get("logo_text", ""))
	_name.text = String(tenant.get("display_name", "")).to_upper()
	_location.text = String(tenant.get("location_label", ""))


func _update_clock() -> void:
	_clock.text = Fmt.clock_12h(Time.get_time_dict_from_system())


func get_clock_text() -> String:
	return _clock.text if _clock else ""
