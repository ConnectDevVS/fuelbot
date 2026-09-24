extends Node
## Dev-only screenshot hook. Inert unless launched with -- --capture=<abs path>.
## Waits in real time (unlike Movie Maker) so HTTP-dependent screens have their data.

func _ready() -> void:
	var out := ""
	var delay := 4.0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):
			out = arg.trim_prefix("--capture=")
		elif arg.begins_with("--capture-delay="):
			delay = float(arg.trim_prefix("--capture-delay="))
	if out == "":
		queue_free()
		return
	await get_tree().create_timer(delay).timeout
	await RenderingServer.frame_post_draw
	var err := get_viewport().get_texture().get_image().save_png(out)
	print("CAPTURED ", out)
	get_tree().quit(0 if err == OK else 1)
