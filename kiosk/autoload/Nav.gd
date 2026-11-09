extends Node
## All scene changes go through here so tests can observe navigation.

signal navigated(path: String)

var dry_run := false          # tests: record, don't change scene
var last_requested := ""


func go(path: String) -> void:
	last_requested = path
	navigated.emit(path)
	if dry_run:
		return
	get_tree().change_scene_to_file.call_deferred(path)


## Idle is the only scene that decides between attract and maintenance.
func go_idle() -> void:
	OrderState.reset()
	go(ScenePaths.IDLE)
