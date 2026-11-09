class_name NetIcon
extends Control
## Icons for the settings screens, drawn in code (no bundled font has ✓, a lock or a Wi-Fi
## fan; settings README). kind: "wifi" (fan), "bars" (signal, `level` 0..4), "lock", "tick",
## "cross", "spinner" (rotates while visible).

@export var kind := "wifi":
	set(value):
		kind = value
		set_process(value == "spinner")
		queue_redraw()
@export var color: Color = Palette.TEXT:
	set(value):
		color = value
		queue_redraw()
@export var level := 4:
	set(value):
		level = clampi(value, 0, 4)
		queue_redraw()
@export var side := 48.0:
	set(value):
		side = value
		custom_minimum_size = Vector2(value, value)
		queue_redraw()

var _angle := 0.0


## Signal strength (0–100, nmcli's SIGNAL) → bars 0..4.
static func bars_for(signal_pct: int) -> int:
	if signal_pct < 0:
		return 0
	return clampi(int(ceil(signal_pct / 25.0)), 1, 4)


func _ready() -> void:
	custom_minimum_size = Vector2(side, side)
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(kind == "spinner")


func _process(delta: float) -> void:
	if is_visible_in_tree():
		_angle = fmod(_angle + delta * TAU, TAU)
		queue_redraw()


func _draw() -> void:
	var s := minf(size.x, size.y)
	var o := (size - Vector2(s, s)) / 2.0
	var w := maxf(s * 0.09, 3.0)
	var dim := Color(color, 0.25)
	match kind:
		"wifi":
			var c := o + Vector2(s * 0.5, s * 0.85)
			for i in 3:
				var r := s * (0.25 + 0.22 * i)
				draw_arc(c, r, deg_to_rad(-135), deg_to_rad(-45), 24, color, w, true)
			draw_circle(c, w * 0.9, color, true, -1.0, true)
		"bars":
			var bw := s * 0.16
			for i in 4:
				var h := s * (0.3 + 0.2 * i)
				var x := o.x + s * 0.06 + i * (bw + s * 0.08)
				draw_rect(Rect2(x, o.y + s * 0.95 - h, bw, h), color if i < level else dim)
		"lock":
			var body := Rect2(o + Vector2(s * 0.2, s * 0.45), Vector2(s * 0.6, s * 0.45))
			draw_rect(body, color)
			draw_arc(o + Vector2(s * 0.5, s * 0.45), s * 0.2, PI, TAU, 16, color, w, true)
		"tick":
			draw_polyline(PackedVector2Array([o + Vector2(s * 0.18, s * 0.52), o + Vector2(s * 0.42, s * 0.76),
				o + Vector2(s * 0.84, s * 0.26)]), color, w * 1.4, true)
		"cross":
			draw_line(o + Vector2(s * 0.22, s * 0.22), o + Vector2(s * 0.78, s * 0.78), color, w * 1.4, true)
			draw_line(o + Vector2(s * 0.78, s * 0.22), o + Vector2(s * 0.22, s * 0.78), color, w * 1.4, true)
		"spinner":
			var c := o + Vector2(s, s) / 2.0
			draw_arc(c, s * 0.4, 0.0, TAU, 48, dim, w, true)
			draw_arc(c, s * 0.4, _angle, _angle + PI * 0.6, 24, color, w, true)
