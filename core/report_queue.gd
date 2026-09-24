class_name ReportQueue
extends RefCounted
## A durable outbound queue of JSON records, POSTed one at a time, oldest first
## (devdocs/stories/telemetry/TEL-05; Milestone 6's SalesReporter reuses it).
## - Durable before network: every change is written to disk atomically (tmp + rename).
## - 2xx: removed. 408/429/5xx/connection error: kept and retried on a timer.
##   Other 4xx: dropped with an error (a record the backend rejects would block forever).
## - Capped at max_records: the oldest is dropped with a warning.
## - An empty URL or headers (e.g. no tenant yet): nothing is sent, the record waits.

signal delivered(record: Dictionary)
signal dropped(record: Dictionary, why: String)

var queue_path: String
var max_records: int
var _records: Array = []
var _url_provider: Callable
var _headers_provider: Callable
var _http: HTTPRequest
var _timer: Timer
var _in_flight := false
var _log_tag: String


## host owns the HTTPRequest and retry Timer (they need to be in the tree).
func _init(host: Node, path: String, url_provider: Callable, headers_provider: Callable,
		retry_sec: float, max_count := 5000, log_tag := "[ReportQueue]") -> void:
	queue_path = path
	max_records = max_count
	_url_provider = url_provider
	_headers_provider = headers_provider
	_log_tag = log_tag
	_http = HTTPRequest.new()
	_http.timeout = 15.0
	_http.request_completed.connect(_on_completed)
	host.add_child(_http)
	_timer = Timer.new()
	_timer.wait_time = maxf(retry_sec, 0.05)
	_timer.timeout.connect(flush)
	host.add_child(_timer)
	_timer.start()
	_load()


func size() -> int:
	return _records.size()


func records() -> Array:
	return _records.duplicate(true)


func enqueue(record: Dictionary) -> void:
	_records.append(record)
	while _records.size() > max_records:
		var old: Dictionary = _records.pop_front()
		push_warning("%s queue full (%d); dropped the oldest record" % [_log_tag, max_records])
		dropped.emit(old, "overflow")
	_save()
	flush()


## Sends the oldest record unless a request is already in flight.
func flush() -> void:
	if _in_flight or _records.is_empty() or not is_instance_valid(_http) or not _http.is_inside_tree():
		return
	var url: String = _url_provider.call()
	var headers: PackedStringArray = _headers_provider.call()
	if url == "" or headers.is_empty():
		return
	headers.append("Content-Type: application/json")
	var err := _http.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(_records[0]))
	if err != OK:
		push_warning("%s request error %s; will retry" % [_log_tag, error_string(err)])
		return
	_in_flight = true


func _on_completed(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	_in_flight = false
	if _records.is_empty():
		return
	if result == HTTPRequest.RESULT_SUCCESS and code >= 200 and code < 300:
		var sent: Dictionary = _records.pop_front()
		_save()
		delivered.emit(sent)
		flush()
	elif result == HTTPRequest.RESULT_SUCCESS and code >= 400 and code < 500 and code != 408 and code != 429:
		var bad: Dictionary = _records.pop_front()
		_save()
		push_error("%s backend rejected a record (HTTP %d); dropped" % [_log_tag, code])
		dropped.emit(bad, "rejected_%d" % code)
		flush()
	else:
		push_warning("%s send failed (result %d, HTTP %d); %d queued, will retry" % [
			_log_tag, result, code, _records.size()])


func _load() -> void:
	if not FileAccess.file_exists(queue_path):
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(queue_path))
	if data is Array:
		for item in data:
			if item is Dictionary:
				_records.append(item)
		return
	var corrupt := queue_path + ".corrupt"
	DirAccess.rename_absolute(queue_path, corrupt)
	push_warning("%s unreadable queue moved to %s; starting empty" % [_log_tag, corrupt])


func _save() -> void:
	DirAccess.make_dir_recursive_absolute(queue_path.get_base_dir())
	var tmp := queue_path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("%s cannot write %s: %s" % [_log_tag, tmp, error_string(FileAccess.get_open_error())])
		return
	f.store_string(JSON.stringify(_records))
	f.close()
	var err := DirAccess.rename_absolute(tmp, queue_path)
	if err != OK:
		push_warning("%s queue rename failed: %s" % [_log_tag, error_string(err)])
