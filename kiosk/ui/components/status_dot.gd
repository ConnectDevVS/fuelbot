class_name StatusDot
extends Control
## A filled circle status indicator (no font has a usable ● glyph).

@export var color: Color = Palette.ACCENT:
	set(value):
		color = value
		queue_redraw()
@export var diameter := 18.0:
	set(value):
		diameter = value
		custom_minimum_size = Vector2(value, value)
		queue_redraw()
@export var pulse := false:
	set(value):
		pulse = value
		_update_pulse()

var _tween: Tween


func _ready() -> void:
	custom_minimum_size = Vector2(diameter, diameter)
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_update_pulse()


func _draw() -> void:
	draw_circle(size / 2.0, diameter / 2.0, color, true, -1.0, true)


func _update_pulse() -> void:
	if not is_inside_tree():
		return
	if _tween:
		_tween.kill()
		_tween = null
	modulate.a = 1.0
	if pulse:
		_tween = create_tween().set_loops()
		_tween.tween_property(self, "modulate:a", 0.35, 0.6).set_trans(Tween.TRANS_SINE)
		_tween.tween_property(self, "modulate:a", 1.0, 0.6).set_trans(Tween.TRANS_SINE)
