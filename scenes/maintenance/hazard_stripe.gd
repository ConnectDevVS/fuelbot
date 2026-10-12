class_name HazardStripe
extends Control
## Amber/black 45° warning stripe along the top edge of the maintenance screen.

const STRIPE := 36.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Palette.BG)
	var h := size.y
	var x := -h
	var i := 0
	while x < size.x + h:
		if i % 2 == 0:
			draw_colored_polygon(PackedVector2Array([
				Vector2(x, h), Vector2(x + h, 0), Vector2(x + h + STRIPE, 0), Vector2(x + STRIPE, h),
			]), Palette.WARNING)
		x += STRIPE
		i += 1
