extends Node
## The single in-progress order. Replaces the old `protein.protein_value` static var.

signal order_reset

var selected_flavor: Dictionary = {}   # set by flavor_select on tap
var selected_base_id: String = ""      # set on Proceed to Pay (details)
var charged_price: int = 0             # set on Proceed to Pay (details)
var order_id: String = ""              # ULID set on Proceed; the analytics key (plan §3.4)
var order_number: int = 0              # display only ("ORDER #0042")
var transaction_id: String = ""        # Razorpay payment id, set by payment on success


func select_flavor(flavor: Dictionary) -> void:
	selected_flavor = flavor.duplicate(true)


func has_selection() -> bool:
	return not selected_flavor.is_empty()


func reset() -> void:
	selected_flavor = {}
	selected_base_id = ""
	charged_price = 0
	order_id = ""
	order_number = 0
	transaction_id = ""
	order_reset.emit()
