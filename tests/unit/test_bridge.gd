extends TestCase
## Bridge against ephemeral UDP listeners (never binds 4242/4243).

var bridge: Node
var sel_peer: PacketPeerUDP
var res_peer: PacketPeerUDP
var received: Array = []   # [[port_name, message, ticks_msec], ...]


func before_each() -> void:
	sel_peer = PacketPeerUDP.new()
	res_peer = PacketPeerUDP.new()
	assert_eq(sel_peer.bind(0, "127.0.0.1"), OK, "bind selection")
	assert_eq(res_peer.bind(0, "127.0.0.1"), OK, "bind result")
	bridge = load("res://autoload/Bridge.gd").new()
	bridge.auto_configure = false
	bridge.selection_port = sel_peer.get_local_port()
	bridge.result_port = res_peer.get_local_port()
	bridge.result_gap_sec = 0.2
	add_child(bridge)
	received.clear()


func after_each() -> void:
	bridge.queue_free()
	sel_peer.close()
	res_peer.close()


func _drain() -> void:
	for pair in [["sel", sel_peer], ["res", res_peer]]:
		var peer: PacketPeerUDP = pair[1]
		while peer.get_available_packet_count() > 0:
			received.append([pair[0], peer.get_packet().get_string_from_utf8(), Time.get_ticks_msec()])


func _collect(seconds: float) -> void:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000)
	while Time.get_ticks_msec() < deadline:
		_drain()
		await get_tree().process_frame
	_drain()


func _messages() -> Array:
	return received.map(func(r: Array) -> String: return "%s:%s" % [r[0], r[1]])


func test_paid_sequence_with_gap() -> void:
	var send_times := {}
	bridge.sent.connect(func(_port: int, message: String) -> void: send_times[message] = Time.get_ticks_msec())
	bridge.send_order_paid(3, "B2")
	await _collect(0.5)
	assert_eq(_messages(), ["sel:P3", "sel:B2", "res:Y"], "received in order")
	var gap: int = send_times.get("Y", 0) - send_times.get("B2", 0)
	assert_true(gap >= 190, "Y sent at least result_gap_sec after B2 (%d ms)" % gap)


func test_cancelled_sends_x() -> void:
	bridge.send_order_cancelled()
	await _collect(0.2)
	assert_eq(_messages(), ["res:X"])


func test_invalid_orders_send_x_only() -> void:
	for args in [[0, "B2"], [7, "B2"], [2, "water"]]:
		received.clear()
		bridge.send_order_paid(args[0], args[1])
		await _collect(0.3)
		assert_eq(_messages(), ["res:X"], "invalid %s" % str(args))


func test_hopper_six_accepted() -> void:
	bridge.send_order_paid(6, "B2")
	await _collect(0.5)
	assert_eq(_messages(), ["sel:P6", "sel:B2", "res:Y"])


func test_reentry_ignored() -> void:
	bridge.send_order_paid(1, "B2")
	bridge.send_order_paid(2, "B2")
	await _collect(0.5)
	assert_eq(_messages(), ["sel:P1", "sel:B2", "res:Y"], "only one sequence")


func test_sent_signal() -> void:
	var sent := watch_signal(bridge, &"sent")
	bridge.send_order_cancelled()
	assert_eq(sent.args[0], bridge.result_port, "port")
	assert_eq(sent.args[1], "X", "message")
