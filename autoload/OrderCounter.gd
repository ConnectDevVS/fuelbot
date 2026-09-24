extends Node
## Display-only per-machine order number ("ORDER #0042"). Never an analytics key:
## it collides across machines and restarts after a re-image (use OrderState.order_id).

const MAX_NUMBER := 9999

var counter_path := "user://order_counter.txt"


## Returns the next number and persists the one after it (1..9999, wrapping).
func next() -> int:
	var value := 1
	if FileAccess.file_exists(counter_path):
		var text := FileAccess.get_file_as_string(counter_path).strip_edges()
		if text.is_valid_int() and int(text) >= 1 and int(text) <= MAX_NUMBER:
			value = int(text)
	var following := value + 1 if value < MAX_NUMBER else 1
	var tmp := counter_path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("[OrderCounter] cannot persist counter: %s" % error_string(FileAccess.get_open_error()))
		return value
	f.store_string(str(following))
	f.close()
	DirAccess.rename_absolute(tmp, counter_path)
	return value
