extends Node
## Dev-only screenshot hook. Inert unless launched with -- --capture=<abs path>.
## Waits in real time (unlike Movie Maker) so HTTP-dependent screens have their data.
## Optional --select=<flavor id> puts that flavor in OrderState first, so screens
## that need a selection (details, payment) can be launched directly.

func _ready() -> void:
	var out := ""
	var delay := 4.0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):
			out = arg.trim_prefix("--capture=")
		elif arg.begins_with("--capture-delay="):
			delay = float(arg.trim_prefix("--capture-delay="))
		elif arg.begins_with("--select="):
			_select(arg.trim_prefix("--select="))
	if out == "":
		queue_free()
		return
	await get_tree().create_timer(delay).timeout
	await RenderingServer.frame_post_draw
	var err := get_viewport().get_texture().get_image().save_png(out)
	print("CAPTURED ", out)
	get_tree().quit(0 if err == OK else 1)


func _select(id: String) -> void:
	for f in ConfigManager.get_flavors():
		if f.id == id:
			OrderState.select_flavor(f)
			OrderState.charged_price = ConfigManager.get_charge_price(f)
			return
	push_warning("[DevCapture] no flavor '%s' to select" % id)
