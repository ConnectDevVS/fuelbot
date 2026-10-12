extends Control
## "Fuel Up" item listing (PDF page 2). Shows every enabled flavor (sold-out greyed),
## records the tapped one in OrderState, and returns to idle after inactivity.
## Deliberately does NOT check maintenance: idle is the only enforcement point.

const BrandHeaderScene := preload("res://ui/components/brand_header/BrandHeader.tscn")
const ProductCardScene := preload("res://ui/components/product_card/ProductCard.tscn")
const FooterBarScene := preload("res://ui/components/footer_bar/FooterBar.tscn")

var _grid: GridContainer
var _empty: Label
var _scroll: ScrollContainer
var _inactivity: Timer


func _ready() -> void:
	_build()
	_build_cards()
	ConfigManager.config_ready.connect(func(_c: Dictionary) -> void: _build_cards())
	_inactivity = Timer.new()
	_inactivity.one_shot = true
	_inactivity.wait_time = maxf(ConfigManager.get_timing("flavor_screen_inactivity_sec", 60.0), 0.05)
	_inactivity.timeout.connect(Nav.go_idle)
	add_child(_inactivity)
	_inactivity.start()


func _input(event: InputEvent) -> void:
	var touched: bool = (event is InputEventMouseButton and event.pressed) \
		or event is InputEventScreenTouch or event is InputEventScreenDrag
	if touched and _inactivity:
		_inactivity.start()


func get_cards() -> Array[Node]:
	return _grid.get_children()


func _build_cards() -> void:
	for child in _grid.get_children():
		_grid.remove_child(child)
		child.queue_free()
	var flavors := ConfigManager.get_flavors()
	for f in flavors:
		var card := ProductCardScene.instantiate()
		_grid.add_child(card)
		card.set_flavor(f)
		card.selected.connect(_on_card_selected)
	_empty.visible = flavors.is_empty()
	_scroll.visible = not flavors.is_empty()


func _on_card_selected(flavor: Dictionary) -> void:
	OrderState.select_flavor(flavor)
	Nav.go(ScenePaths.FLAVOR_DETAIL)


func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var top := _margin(Palette.PAD, 60, 0)
	root.add_child(top)
	var top_col := VBoxContainer.new()
	top_col.add_theme_constant_override("separation", 40)
	top.add_child(top_col)
	var header := BrandHeaderScene.instantiate()
	header.right_mode = "clock"
	top_col.add_child(header)
	var title_row := HBoxContainer.new()
	title_row.name = "TitleRow"
	top_col.add_child(title_row)
	var title := Label.new()
	title.theme_type_variation = &"DisplayL"
	title.text = ConfigManager.get_message("listing_title")
	title_row.add_child(title)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_child(spacer)
	var hint := Label.new()
	hint.theme_type_variation = &"Body"
	hint.text = ConfigManager.get_message("listing_hint")
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hint.size_flags_vertical = Control.SIZE_SHRINK_END
	title_row.add_child(hint)

	var body := _margin(Palette.PAD, 40, 24)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)
	_scroll = ScrollContainer.new()
	_scroll.name = "Scroll"
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(_scroll)
	_grid = GridContainer.new()
	_grid.name = "Grid"
	_grid.columns = 2
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid.add_theme_constant_override("h_separation", 28)
	_grid.add_theme_constant_override("v_separation", 28)
	_scroll.add_child(_grid)
	_empty = Label.new()
	_empty.name = "EmptyLabel"
	_empty.theme_type_variation = &"Body"
	_empty.text = ConfigManager.get_message("listing_empty")
	_empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_empty.visible = false
	body.add_child(_empty)

	var footer := FooterBarScene.instantiate()
	footer.left_key = "listing_footer"
	footer.ready_key = "status_machine_ready"
	root.add_child(footer)


func _margin(side: int, top: int, bottom: int) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", side)
	m.add_theme_constant_override("margin_right", side)
	m.add_theme_constant_override("margin_top", top)
	m.add_theme_constant_override("margin_bottom", bottom)
	return m
