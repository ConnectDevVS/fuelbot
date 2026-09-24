extends Node
## Razorpay UPI QR payments (plan §3.5): create a single-use fixed-amount QR,
## download its image, poll for payment, close it. Payment-only: never touches
## OrderState; the caller passes everything in.
##
## Credentials come from a local ConfigFile (never source, never logs). The key
## and secret are only ever used to build the auth header; log the mode only.
## Talks to api.razorpay_base_url, which dev points at the mock server.

signal qr_created(qr_id: String, image_path: String, amount_rupees: int)
signal qr_create_failed(reason: String)
signal payment_received(payment_id: String, amount_paise: int)
signal payment_failed(reason: String)

const IMAGE_PATH := "user://qr_current.png"

# Overridable for tests (a fresh instance with auto_configure = false).
var auto_configure := true
var base_url := ""
var credentials_path := ""
var allow_live_keys := false
var poll_interval_sec := 3.0
var poll_timeout_sec := 180.0
var qr_expiry_sec := 180.0
var request_timeout_sec := 10.0

var _mode := ""
var _auth_header := ""
var _qr_id := ""
var _amount_rupees := 0
var _finished := false
var _poll_deadline_msec := 0
var _http_create: HTTPRequest
var _http_image: HTTPRequest
var _http_poll: HTTPRequest
var _poll_timer: Timer


func _ready() -> void:
	_http_create = _make_http(_on_create_completed)
	_http_image = _make_http(_on_image_completed)
	_http_poll = _make_http(_on_poll_completed)
	_poll_timer = Timer.new()
	_poll_timer.timeout.connect(_on_poll_tick)
	add_child(_poll_timer)
	if auto_configure:
		configure_from_settings()


func configure_from_settings() -> void:
	var api: Dictionary = ConfigManager.local_settings.get("api", {})
	var payments: Dictionary = ConfigManager.local_settings.get("payments", {})
	base_url = String(api.get("razorpay_base_url", "https://api.razorpay.com"))
	request_timeout_sec = float(api.get("request_timeout_sec", 10))
	credentials_path = String(payments.get("credentials_path", "user://razorpay_credentials.cfg"))
	allow_live_keys = bool(payments.get("allow_live_keys", false))
	poll_interval_sec = ConfigManager.get_timing("payment_poll_interval_sec", 3.0)
	poll_timeout_sec = ConfigManager.get_timing("payment_poll_timeout_sec", 180.0)
	qr_expiry_sec = ConfigManager.get_timing("qr_expiry_sec", 180.0)
	reload_credentials()


## Applies request_timeout_sec to the request nodes (call after changing it).
func apply_timeouts() -> void:
	for http in [_http_create, _http_image, _http_poll]:
		http.timeout = request_timeout_sec


func reload_credentials() -> void:
	_mode = ""
	_auth_header = ""
	var cfg := ConfigFile.new()
	if cfg.load(credentials_path) != OK:
		push_warning("[Razorpay] no credentials at %s" % credentials_path)
		return
	var key_id := String(cfg.get_value("razorpay", "key_id", "")).strip_edges()
	var key_secret := String(cfg.get_value("razorpay", "key_secret", "")).strip_edges()
	if key_id == "" or key_secret == "":
		push_warning("[Razorpay] incomplete credentials at %s" % credentials_path)
		return
	if key_id.begins_with("rzp_test_"):
		_mode = "test"
	elif key_id.begins_with("rzp_live_"):
		_mode = "live"
	else:
		_mode = "mock"
	_auth_header = "Authorization: Basic " + Marshalls.utf8_to_base64(key_id + ":" + key_secret)
	print("[Razorpay] ready (mode=%s)" % _mode)
	apply_timeouts()


func is_configured() -> bool:
	return _mode != ""


func mode() -> String:
	return _mode


func current_qr_id() -> String:
	return _qr_id


func create_qr(amount_rupees: int, order_id: String, order_number: int, description: String) -> void:
	if not is_configured():
		qr_create_failed.emit.call_deferred("not_configured")
		return
	if _mode == "live" and not allow_live_keys:
		qr_create_failed.emit.call_deferred("live_keys_disallowed")
		return
	if _qr_id != "":
		stop_polling()
		close_qr()
	_finished = false
	_amount_rupees = amount_rupees
	var body := {
		"type": "upi_qr",
		"name": String(ConfigManager.get_tenant().get("display_name", "FuelBot")).left(50),
		"usage": "single_use",
		"fixed_amount": true,
		"payment_amount": amount_rupees * 100,
		"description": description,
		"close_by": int(Time.get_unix_time_from_system() + qr_expiry_sec),
		"notes": {
			"order_id": order_id,
			"order_number": str(order_number),
			"tenant_id": ConfigManager.tenant_id,
		},
	}
	var err := _http_create.request(_url("/v1/payments/qr_codes"),
		[_auth_header, "Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(body))
	if err != OK:
		qr_create_failed.emit.call_deferred("network")


## One immediate poll (also after stop_polling), e.g. the final check on Cancel.
func check_now() -> void:
	if _qr_id == "" or _finished:
		return
	if _http_poll.get_http_client_status() == HTTPClient.STATUS_DISCONNECTED:
		_poll()
	# Otherwise a poll is already in flight; its result emits the same signals.


func stop_polling() -> void:
	_poll_timer.stop()


## Fire-and-forget close of the current QR; safe to call twice.
func close_qr() -> void:
	if _qr_id == "":
		return
	var http := HTTPRequest.new()
	http.timeout = request_timeout_sec
	add_child(http)
	http.request_completed.connect(func(_r, _c, _h, _b) -> void: http.queue_free())
	if http.request(_url("/v1/payments/qr_codes/%s/close" % _qr_id), [_auth_header, "Content-Type: application/json"],
			HTTPClient.METHOD_POST, "{}") != OK:
		http.queue_free()
	_qr_id = ""


# --- Internals ---------------------------------------------------------------

func _on_create_completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		qr_create_failed.emit("network")
		return
	if code != 200:
		qr_create_failed.emit("http_%d" % code)
		return
	var data = JSON.parse_string(body.get_string_from_utf8())
	if not data is Dictionary or String(data.get("id", "")) == "" or String(data.get("image_url", "")) == "":
		qr_create_failed.emit("bad_response")
		return
	_qr_id = data.id
	_http_image.download_file = IMAGE_PATH
	if _http_image.request(String(data.image_url)) != OK:
		qr_create_failed.emit("image_download")
		close_qr()


func _on_image_completed(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	var ok := result == HTTPRequest.RESULT_SUCCESS and code == 200 and FileAccess.file_exists(IMAGE_PATH) \
		and FileAccess.get_file_as_bytes(IMAGE_PATH).size() > 0
	if not ok:
		qr_create_failed.emit("image_download")
		close_qr()
		return
	_poll_deadline_msec = Time.get_ticks_msec() + int(poll_timeout_sec * 1000)
	_poll_timer.wait_time = maxf(poll_interval_sec, 0.05)
	_poll_timer.start()
	qr_created.emit(_qr_id, IMAGE_PATH, _amount_rupees)


func _on_poll_tick() -> void:
	if _finished:
		stop_polling()
		return
	if Time.get_ticks_msec() >= _poll_deadline_msec:
		_finish()
		payment_failed.emit("timeout")
		return
	if _http_poll.get_http_client_status() == HTTPClient.STATUS_DISCONNECTED:
		_poll()


func _poll() -> void:
	if _http_poll.request(_url("/v1/payments/qr_codes/%s/payments" % _qr_id), [_auth_header]) != OK:
		push_warning("[Razorpay] poll request failed to start")


func _on_poll_completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if _finished:
		return
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		return  # transient: keep polling; only the timeout ends an order
	var data = JSON.parse_string(body.get_string_from_utf8())
	if not data is Dictionary:
		return
	var items: Array = data.get("items", [])
	if items.is_empty() or not items[0] is Dictionary:
		return
	var payment: Dictionary = items[0]
	match String(payment.get("status", "")):
		"captured":
			_finish()
			payment_received.emit(String(payment.get("id", "")), int(payment.get("amount", 0)))
		"failed":
			_finish()
			payment_failed.emit("failed")


func _finish() -> void:
	_finished = true
	stop_polling()


func _url(path: String) -> String:
	return base_url.rstrip("/") + path


func _make_http(callback: Callable) -> HTTPRequest:
	var http := HTTPRequest.new()
	http.timeout = request_timeout_sec
	http.request_completed.connect(callback)
	add_child(http)
	return http
