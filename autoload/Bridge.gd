extends Node
## UDP link to the hardware bridge (hardware/bridge/udprxtx.py), protocol v2
## (devdocs/stories/dispensing/README.md):
##   app -> bridge  4242  ORDER <order_id> P<hopper> B<n>    once, only after payment (plan §3.2)
##                  4242  CANCEL <order_id>                  cancel/failure/expiry (informational)
##   bridge -> app  4245  DONE <order_id>
##                        TIMEOUT <order_id> <reason>        started, no STATUS:DONE
##                        REJECTED <order_id> <reason>       never started
## The 4245 listener lives here, for the app's lifetime, not in the dispensing
## scene: a bridge can answer before that scene has loaded, and a datagram to an
## unbound port is lost. Results are cached per order for the scene to read.

signal sent(port: int, message: String)
signal result_received(order_id: String, kind: String, reason: String)

const RESULT_CACHE_SIZE := 16
const LISTEN_RETRY_SEC := 5.0

var host := "127.0.0.1"
var order_port := 4242
var listen_host := "127.0.0.1"
var listen_port := 4245
var auto_configure := true

var _sender := PacketPeerUDP.new()
var _listener := PacketPeerUDP.new()
var _listening := false
var _listen_warned := false
var _next_listen_try_msec := 0
var _sent_orders: Array[String] = []
var _results: Dictionary = {}          # order_id -> {"kind", "reason"}
var _result_order: Array[String] = []  # oldest first, for eviction
var _result_re := RegEx.create_from_string(
	"^(DONE|TIMEOUT|REJECTED) ([0-7][0-9A-HJKMNP-TV-Z]{25})(?: (\\S+))?$")
var _base_re := RegEx.create_from_string("^B\\d$")


func _ready() -> void:
	if auto_configure:
		configure_from_settings()
	else:
		connect_sockets()


func _exit_tree() -> void:
	_listener.close()
	_sender.close()


func configure_from_settings() -> void:
	var cfg: Dictionary = ConfigManager.local_settings.get("bridge", {})
	host = String(cfg.get("host", "127.0.0.1"))
	order_port = int(cfg.get("order_port", 4242))
	listen_host = String(cfg.get("listen_host", "127.0.0.1"))
	listen_port = int(cfg.get("listen_port", 4245))
	connect_sockets()
	listen()


## (Re)connects the sending socket; call after changing host/order_port.
func connect_sockets() -> void:
	_sender.close()
	_sender.connect_to_host(host, order_port)


## (Re)binds the result listener. listen_port 0 picks a free port (tests).
func listen() -> Error:
	_listener.close()
	_listening = false
	var err := _listener.bind(listen_port, listen_host)
	if err == OK:
		_listening = true
		_listen_warned = false
		print("[Bridge] listening on %s:%d" % [listen_host, _listener.get_local_port()])
	elif not _listen_warned:
		_listen_warned = true
		push_warning("[Bridge] can't listen on %s:%d (%s); retrying every %ds" % [
			listen_host, listen_port, error_string(err), int(LISTEN_RETRY_SEC)])
	_next_listen_try_msec = Time.get_ticks_msec() + int(LISTEN_RETRY_SEC * 1000)
	return err


func is_listening() -> bool:
	return _listening


func get_listen_port() -> int:
	return _listener.get_local_port() if _listening else 0


## Sends ORDER once per order id. An invalid order is a programmer error: it is
## refused, CANCEL goes out instead, and a local REJECTED result is recorded so
## the dispensing screen fails at once rather than waiting for its safety cap.
func send_order_paid(order_id: String, hopper: int, base_code: String) -> bool:
	if order_id in _sent_orders:
		push_warning("[Bridge] order %s already sent; ignored" % order_id)
		return false
	var valid := Ulid.is_valid(order_id) and hopper >= 1 and hopper <= ConfigManager.MAX_HOPPER \
		and _base_re.search(base_code) != null
	if not valid:
		push_error("[Bridge] refusing malformed order (id=%s hopper=%d base=%s)" % [order_id, hopper, base_code])
		if Ulid.is_valid(order_id):
			send_order_cancelled(order_id)
			_record_result(order_id, "REJECTED", "bad_order")
		return false
	_sent_orders.append(order_id)
	if _sent_orders.size() > RESULT_CACHE_SIZE:
		_sent_orders.pop_front()
	_send("ORDER %s P%d %s" % [order_id, hopper, base_code])
	return true


func send_order_cancelled(order_id: String) -> void:
	if not Ulid.is_valid(order_id):
		push_warning("[Bridge] not sending CANCEL for invalid order id '%s'" % order_id)
		return
	_send("CANCEL %s" % order_id)


## {} until a result for order_id has arrived, then {"kind", "reason"}.
func get_result(order_id: String) -> Dictionary:
	return _results.get(order_id, {})


func _process(_delta: float) -> void:
	if not _listening:
		if Time.get_ticks_msec() >= _next_listen_try_msec:
			listen()
		return
	while _listener.get_available_packet_count() > 0:
		var text := _listener.get_packet().get_string_from_utf8().strip_edges()
		var m := _result_re.search(text)
		if m == null:
			print("[Bridge] <- ignored '%s'" % text.c_escape())
			continue
		print("[Bridge] <- %s" % text)
		_record_result(m.get_string(2), m.get_string(1), m.get_string(3))


func _record_result(order_id: String, kind: String, reason: String) -> void:
	if _results.has(order_id):
		print("[Bridge] duplicate result for %s (%s); keeping %s" % [order_id, kind, _results[order_id].kind])
		return
	_results[order_id] = {"kind": kind, "reason": reason}
	_result_order.append(order_id)
	while _result_order.size() > RESULT_CACHE_SIZE:
		_results.erase(_result_order.pop_front())
	result_received.emit(order_id, kind, reason)


func _send(message: String) -> void:
	var err := _sender.put_packet(message.to_utf8_buffer())
	if err != OK:
		push_warning("[Bridge] send '%s' to %d failed: %s" % [message, order_port, error_string(err)])
	print("[Bridge] -> %d %s" % [order_port, message])
	sent.emit(order_port, message)
