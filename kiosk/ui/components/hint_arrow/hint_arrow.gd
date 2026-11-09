class_name HintArrow
extends Control
## A drawn down-arrow that gently bobs: "look down here". Not a button (no fill,
## no hit area), for instructions like "Collect from the hatch below".

@export var color: Color = Palette.ON_ACCENT:
	set(value):
		color = value
		queue_redraw()
@export var bob := true:
	set(value):
		bob = value
		_update_bob()

const BOB_PX := 10.0

var _offset := 0.0:
	set(value):
		_offset = value
		queue_redraw()
var _tween: Tween


func _ready() -> void:
	custom_minimum_size = Vector2(56, 72)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_update_bob()


func _draw() -> void:
	var w := 9.0
	var cx := size.x / 2.0
	var top := Vector2(cx, 6 + _offset)
	var tip := Vector2(cx, size.y - BOB_PX - 6 + _offset)
	var head := size.x * 0.36
	draw_line(top, tip, color, w, true)
	draw_polyline(PackedVector2Array([tip + Vector2(-head, -head), tip, tip + Vector2(head, -head)]), color, w, true)
	for p in [top, tip + Vector2(-head, -head), tip + Vector2(head, -head), tip]:
		draw_circle(p, w / 2.0, color, true, -1.0, true)


func _update_bob() -> void:
	if not is_inside_tree():
		return
	if _tween:
		_tween.kill()
		_tween = null
	_offset = 0.0
	if bob:
		_tween = create_tween().set_loops()
		_tween.tween_property(self, "_offset", BOB_PX, 0.6).set_trans(Tween.TRANS_SINE)
		_tween.tween_property(self, "_offset", 0.0, 0.6).set_trans(Tween.TRANS_SINE)
