extends SceneTree
## Trims the transparent border off the bundled flavor images and scales them down to fit
## 600 x 800 (the S3 image spec, devdocs/image-spec.md), in place. Idempotent.
## godot --headless --path . --script res://tools/trim_flavor_images.gd
## then: godot --headless --path . --import
## Images README decision 16: done once, as files, not at every load on the Pi.

const DIR := "res://assets/images/flavors"
const MAX_SIZE := Vector2i(600, 800)


func _initialize() -> void:
	var FlavorImagesScript := load("res://autoload/FlavorImages.gd")
	var changed := 0
	for file in DirAccess.get_files_at(DIR):
		if not file.ends_with(".png"):
			continue
		var path := ProjectSettings.globalize_path(DIR.path_join(file))
		var image := Image.load_from_file(path)
		if image == null:
			printerr("cannot load ", path)
			quit(1)
			return
		var before := image.get_size()
		var out: Image = FlavorImagesScript.trim_transparent(image)
		var scale := minf(1.0, minf(float(MAX_SIZE.x) / out.get_width(), float(MAX_SIZE.y) / out.get_height()))
		if scale < 1.0:
			if out == image:
				out = image.duplicate()
			out.resize(maxi(1, roundi(out.get_width() * scale)), maxi(1, roundi(out.get_height() * scale)),
				Image.INTERPOLATE_LANCZOS)
			out = FlavorImagesScript.trim_transparent(out)   # resampling can leave clear edge rows
		if out == image:
			print("%s: %s, unchanged" % [file, before])
			continue
		out.save_png(path)
		changed += 1
		print("%s: %s -> %s" % [file, before, out.get_size()])
	print("trimmed %d image(s)" % changed)
	quit(0)
