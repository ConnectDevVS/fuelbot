class_name Ulid
## ULIDs: 26 Crockford-base32 chars = 48-bit ms timestamp + 80 random bits.
## Fleet-unique order IDs generated offline without coordination (plan §3.4).

const ALPHABET := "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const MAX_TIME := 281474976710655  # 2^48 - 1


static func generate(unix_ms: int = -1) -> String:
	if unix_ms < 0:
		unix_ms = int(Time.get_unix_time_from_system() * 1000.0)
	var out := _encode(clampi(unix_ms, 0, MAX_TIME), 10)
	# Crypto RNG, not randi(): identically imaged machines must never collide.
	var rnd := Crypto.new().generate_random_bytes(10)
	for half in 2:
		var bits := 0
		for i in 5:
			bits = (bits << 8) | rnd[half * 5 + i]
		out += _encode(bits, 8)
	return out


static func timestamp_ms(ulid: String) -> int:
	var t := 0
	for i in 10:
		t = (t << 5) | ALPHABET.find(ulid[i])
	return t


static func is_valid(ulid: String) -> bool:
	if ulid.length() != 26 or ALPHABET.find(ulid[0]) > 7:
		return false
	for c in ulid:
		if ALPHABET.find(c) < 0:
			return false
	return true


## Encodes the low 5*count bits of value, most significant first.
static func _encode(value: int, count: int) -> String:
	var chars := PackedStringArray()
	chars.resize(count)
	for i in range(count - 1, -1, -1):
		chars[i] = ALPHABET[value & 31]
		value >>= 5
	return "".join(chars)
