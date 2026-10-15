extends TestCase


func test_viewport_is_portrait_1080x1920() -> void:
	assert_eq(ProjectSettings.get_setting("display/window/size/viewport_width"), 1080, "width")
	assert_eq(ProjectSettings.get_setting("display/window/size/viewport_height"), 1920, "height")


func test_renderer_is_compatibility() -> void:
	assert_eq(ProjectSettings.get_setting("rendering/renderer/rendering_method"), "gl_compatibility")


func test_main_scene_loads() -> void:
	var scene = load(ProjectSettings.get_setting("application/run/main_scene"))
	assert_true(scene is PackedScene, "main scene is a PackedScene")
	if scene is PackedScene:
		var inst: Node = scene.instantiate()
		assert_true(inst != null, "main scene instantiates")
		inst.free()
