extends Node
## The single in-progress order. Replaces the old `protein.protein_value` static var.

signal order_reset

var selected_flavor: Dictionary = {}   # set by flavor_select on tap
var selected_base_id: String = ""      # set by payment (later story)
var charged_price: int = 0             # set by payment (later story)
var transaction_id: String = ""        # set by payment on success (later story)


func select_flavor(flavor: Dictionary) -> void:
	selected_flavor = flavor.duplicate(true)


func has_selection() -> bool:
	return not selected_flavor.is_empty()


func reset() -> void:
	selected_flavor = {}
	selected_base_id = ""
	charged_price = 0
	transaction_id = ""
	order_reset.emit()
