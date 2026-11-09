extends TestCase
## Bridge protocol v2 against ephemeral UDP ports (never binds 4242/4245).

var bridge: Node
var peer: PacketPeerUDP      # stands in for the bridge's order port
var reply: PacketPeerUDP     # stands in for the bridge sending results
var id := ""


func before_each() -> void:
	peer = PacketPeerUDP.new()
	assert_eq(peer.bind(0, "127.0.0.1"), OK, "bind order peer")
	bridge = load("res://autoload/Bridge.gd").new()
	bridge.auto_configure = false
	bridge.order_port = peer.get_local_port()
	bridge.listen_port = 0
	add_child(bridge)
	assert_eq(bridge.listen(), OK, "listen on a free port")
	reply = PacketPeerUDP.new()
	reply.connect_to_host("127.0.0.1", bridge.get_listen_port())
	id = Ulid.generate()


func after_each() -> void:
	bridge.queue_free()
	peer.close()
	reply.close()


func _received(seconds: float = 0.2) -> Array:
	var got := []
	var deadline := Time.get_ticks_msec() + int(seconds * 1000)
	while Time.get_ticks_msec() < deadline:
		while peer.get_available_packet_count() > 0:
			got.append(peer.get_packet().get_string_from_utf8())
		await get_tree().process_frame
	return got


func _reply(text: String) -> void:
	reply.put_packet(text.to_utf8_buffer())
	await wait_seconds(0.15)


func test_order_message() -> void:
	assert_true(bridge.send_order_paid(id, 3, "B2"), "accepted")
	assert_eq(await _received(), ["ORDER %s P3 B2" % id], "one atomic datagram")


func test_hopper_six_accepted() -> void:
	assert_true(bridge.send_order_paid(id, 6, "B2"), "accepted")
	assert_eq(await _received(), ["ORDER %s P6 B2" % id])


func test_invalid_orders_rejected_locally() -> void:
	for args in [[0, "B2"], [7, "B2"], [2, "water"]]:
		var order := Ulid.generate()
		assert_false(bridge.send_order_paid(order, args[0], args[1]), "refused %s" % str(args))
		assert_eq(await _received(), ["CANCEL %s" % order], "only CANCEL for %s" % str(args))
		assert_eq(bridge.get_result(order), {"kind": "REJECTED", "reason": "bad_order"}, "local result")
	assert_false(bridge.send_order_paid("not-a-ulid", 1, "B2"), "bad id refused")
	assert_eq(await _received(), [], "nothing sent for a bad id")


func test_duplicate_order_ignored() -> void:
	assert_true(bridge.send_order_paid(id, 1, "B2"), "first")
	assert_false(bridge.send_order_paid(id, 1, "B2"), "second ignored")
	assert_eq(await _received(), ["ORDER %s P1 B2" % id], "one datagram")


func test_cancel_message() -> void:
	bridge.send_order_cancelled(id)
	bridge.send_order_cancelled("")
	assert_eq(await _received(), ["CANCEL %s" % id])


func test_sent_signal() -> void:
	var sent := watch_signal(bridge, &"sent")
	bridge.send_order_cancelled(id)
	assert_eq(sent.args[0], bridge.order_port, "port")
	assert_eq(sent.args[1], "CANCEL %s" % id, "message")


func test_receives_results() -> void:
	var cases := [
		["DONE %s", "DONE", ""],
		["TIMEOUT %s deadline", "TIMEOUT", "deadline"],
		["REJECTED %s busy", "REJECTED", "busy"],
	]
	for c in cases:
		var order := Ulid.generate()
		var got := watch_signal(bridge, &"result_received")
		await _reply(c[0] % order)
		assert_true(got.fired, "signal for %s" % c[1])
		assert_eq(got.args, [order, c[1], c[2]], "parsed %s" % c[1])
		assert_eq(bridge.get_result(order), {"kind": c[1], "reason": c[2]}, "cached %s" % c[1])


func test_ignores_malformed() -> void:
	var got := watch_signal(bridge, &"result_received")
	for text in ["DONE", "DONE nope", "Y", "DONE %s a b" % id, "done %s" % id, "FINISHED %s" % id]:
		await _reply(text)
	assert_false(got.fired, "no result signal")
	assert_eq(bridge.get_result(id), {}, "nothing cached")


func test_first_result_wins() -> void:
	await _reply("DONE %s" % id)
	await _reply("TIMEOUT %s deadline" % id)
	assert_eq(bridge.get_result(id).kind, "DONE")


func test_bind_conflict() -> void:
	var other: Node = load("res://autoload/Bridge.gd").new()
	other.auto_configure = false
	other.listen_port = bridge.get_listen_port()
	add_child(other)
	assert_eq(other.listen(), ERR_UNAVAILABLE, "port taken")
	assert_false(other.is_listening(), "not listening")
	other.queue_free()
