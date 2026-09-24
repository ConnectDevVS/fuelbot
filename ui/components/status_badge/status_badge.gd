class_name StatusBadge
extends Control
## A filled circle with a drawn check or "!" (neither font has a usable ✓ glyph).

enum Mark { CHECK, ALERT }

@export var mark: Mark = Mark.CHECK:
	set(value):
		mark = value
		queue_redraw()
@export var diameter := 224.0:
	set(value):
		diameter = value
		custom_minimum_size = Vector2(value, value)
		queue_redraw()
@export var circle_color: Color = Palette.ON_ACCENT:
	set(value):
		circle_color = value
		queue_redraw()
@export var mark_color: Color = Palette.ACCENT:
	set(value):
		mark_color = value
		queue_redraw()


func _ready() -> void:
	custom_minimum_size = Vector2(diameter, diameter)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _draw() -> void:
	var c := size / 2.0
	var d := diameter
	draw_circle(c, d / 2.0, circle_color, true, -1.0, true)
	if mark == Mark.CHECK:
		# Spans ~55% of the diameter, as on PDF page 5.
		var w := d * 0.09
		var pts := PackedVector2Array([c + Vector2(-0.26, 0.0) * d, c + Vector2(-0.08, 0.18) * d,
			c + Vector2(0.28, -0.2) * d])
		draw_polyline(pts, mark_color, w, true)
		for p in pts:
			draw_circle(p, w / 2.0, mark_color, true, -1.0, true)
	else:
		var w := d * 0.1
		var top := c + Vector2(0, -0.26) * d
		var bottom := c + Vector2(0, 0.08) * d
		draw_line(top, bottom, mark_color, w, true)
		draw_circle(top, w / 2.0, mark_color, true, -1.0, true)
		draw_circle(bottom, w / 2.0, mark_color, true, -1.0, true)
		draw_circle(c + Vector2(0, 0.24) * d, w * 0.6, mark_color, true, -1.0, true)
