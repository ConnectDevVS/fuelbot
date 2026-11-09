class_name SettingsHold
extends Node
## The hidden way into settings (docs/stories/settings, SET-02): a press held for
## timing.settings_hold_sec inside the top-left settings.hold_zone_px square (viewport
## coordinates) emits `triggered` while the finger is still down. Nothing is drawn.
## The owning screen passes its input in with feed() and ignores the events it claims.

signal triggered

var hold_sec := 5.0
var zone_px := 200.0

var _down := false
var _down_msec := 0
var _fired := false


func _ready() -> void:
	hold_sec = ConfigManager.get_timing("settings_hold_sec", hold_sec)
	zone_px = float(ConfigManager.local_settings.get("settings", {}).get("hold_zone_px", zone_px))


## Returns true when the event belongs to a hold that has fired (its release), so the owner
## must not treat it as a tap. A short tap in the corner returns false: it's an ordinary tap.
func feed(event: InputEvent) -> bool:
	var pressed: bool = (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT) \
		or event is InputEventScreenTouch
	if pressed:
		if event.pressed:
			if not _down:   # touch and its emulated mouse press both arrive; the first one counts
				_down = _in_zone(event.position)
				_down_msec = Time.get_ticks_msec()
				_fired = false
			return false
		var claimed := _fired
		_down = false
		return claimed
	if (event is InputEventMouseMotion or event is InputEventScreenDrag) and _down \
			and not _in_zone(event.position):
		_down = false
	return false


func is_holding() -> bool:
	return _down and not _fired


func _process(_delta: float) -> void:
	if _down and not _fired and Time.get_ticks_msec() - _down_msec >= int(hold_sec * 1000.0):
		_fired = true
		triggered.emit()


func _in_zone(pos: Vector2) -> bool:
	return pos.x >= 0.0 and pos.y >= 0.0 and pos.x < zone_px and pos.y < zone_px
