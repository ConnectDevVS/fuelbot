extends Node
## One billing record per paid order (plan §3.12, devdocs/stories/sales/README.md), POSTed
## via a durable ReportQueue to api.base_url + api.sales_path. Recorded by the dispensing
## screen once the outcome is known: dispensing_result success | timeout | rejected |
## no_response. order_id is the backend's dedupe key; a second report for it is ignored.

const QUEUE_PATH := "user://sales_queue.json"
const REMEMBERED_ORDERS := 64

var queue_path := QUEUE_PATH
var auto_configure := true
var queue: ReportQueue

var _reported: Array[String] = []


func _ready() -> void:
	if auto_configure:
		start_queue()


## (Re)creates the queue from queue_path and flushes whatever is on disk (flush-on-boot).
func start_queue() -> void:
	if queue:
		for child in get_children():
			child.queue_free()
	queue = ReportQueue.new(self, queue_path,
		func() -> String: return ConfigManager.get_api_endpoint("sales_path"),
		func() -> PackedStringArray: return ConfigManager.get_backend_headers(),
		ConfigManager.get_timing("sale_report_retry_interval_sec", 60.0), 5000, "[Sales]")
	queue.flush.call_deferred()


## Queues the sale unless this order_id was already reported. Adds tenant_id and a UTC timestamp.
func report_sale(sale: Dictionary) -> bool:
	var order_id := String(sale.get("order_id", ""))
	if order_id == "" or order_id in _reported:
		push_warning("[Sales] sale for order '%s' already reported (or no id); ignored" % order_id)
		return false
	_reported.append(order_id)
	if _reported.size() > REMEMBERED_ORDERS:
		_reported.pop_front()
	var record := sale.duplicate(true)
	record["tenant_id"] = ConfigManager.tenant_id
	record["timestamp"] = Time.get_datetime_string_from_system(true) + "Z"   # Godot omits the Z
	print("[Sales] order %s %s %s" % [order_id, record.get("dispensing_result"), record.get("dispensing_reason")])
	queue.enqueue(record)
	return true


## The sale fields for the current (committed) order. Prices come from the flavor copied
## into OrderState at selection, so a later catalog change can't alter them.
static func sale_from_order_state(result: String, reason: String) -> Dictionary:
	var flavor := OrderState.selected_flavor
	return {
		"order_id": OrderState.order_id,
		"order_number": OrderState.order_number,
		"transaction_id": OrderState.transaction_id,
		"flavor_id": String(flavor.get("id", "")),
		"hopper": int(flavor.get("hopper", 0)),
		"base_id": OrderState.selected_base_id,
		"actual_price": int(flavor.get("actual_price", 0)),
		"offer_price": flavor.get("offer_price"),
		"charged_price": OrderState.charged_price,
		"currency": "INR",
		"payment_method": "upi",
		"dispensing_result": result,
		"dispensing_reason": reason,
	}
