extends Node
## UDP client for the hardware bridge (hardware/bridge/udprxtx.py, old protocol):
##   4242  P<hopper>  B<n>     selection (hopper = config field, never list position)
##   4243  Y | X               payment succeeded | cancel/failure (bridge resets)
## The hopper is only sent AFTER payment succeeds (plan §3.2).
## Gap before Y: the current bridge reads 4243 non-blockingly while collecting
## P/B and silently drops an early Y. Milestone 4's bridge rewrite removes this.

signal sent(port: int, message: String)

var host := "127.0.0.1"
var selection_port := 4242
var result_port := 4243
var result_gap_sec := 0.3
var auto_configure := true

var _selection := PacketPeerUDP.new()
var _result := PacketPeerUDP.new()
var _busy := false


func _ready() -> void:
	if auto_configure:
		configure_from_settings()
	else:
		connect_sockets()


func configure_from_settings() -> void:
	var cfg: Dictionary = ConfigManager.local_settings.get("bridge", {})
	host = String(cfg.get("host", "127.0.0.1"))
	selection_port = int(cfg.get("selection_port", 4242))
	result_port = int(cfg.get("result_port", 4243))
	result_gap_sec = float(cfg.get("result_gap_sec", 0.3))
	connect_sockets()


## (Re)connects the sending sockets; call after changing host/ports.
func connect_sockets() -> void:
	_selection.close()
	_result.close()
	_selection.connect_to_host(host, selection_port)
	_result.connect_to_host(host, result_port)


## P<hopper>, B<n>, wait result_gap_sec, then Y. Invalid input sends X instead.
func send_order_paid(hopper: int, base_code: String) -> void:
	if _busy:
		push_warning("[Bridge] send_order_paid already in progress; ignored")
		return
	var valid_base := RegEx.create_from_string("^B\\d$").search(base_code) != null
	if hopper < 1 or hopper > ConfigManager.MAX_HOPPER or not valid_base:
		push_error("[Bridge] refusing malformed order (hopper=%d base=%s); sending X" % [hopper, base_code])
		send_order_cancelled()
		return
	_busy = true
	_send(_selection, selection_port, "P%d" % hopper)
	_send(_selection, selection_port, base_code)
	# Wall-clock wait, not create_timer(): a SceneTreeTimer created right after a
	# slow frame fires early (it consumes that frame's delta), and a short gap
	# here means a dropped Y and a paid order that never dispenses.
	var until := Time.get_ticks_msec() + int(result_gap_sec * 1000)
	while Time.get_ticks_msec() < until:
		await get_tree().process_frame
	_send(_result, result_port, "Y")
	_busy = false


func send_order_cancelled() -> void:
	_send(_result, result_port, "X")


func _send(peer: PacketPeerUDP, port: int, message: String) -> void:
	var err := peer.put_packet(message.to_utf8_buffer())
	if err != OK:
		push_warning("[Bridge] send %s to %d failed: %s" % [message, port, error_string(err)])
	print("[Bridge] -> %d %s" % [port, message])
	sent.emit(port, message)
