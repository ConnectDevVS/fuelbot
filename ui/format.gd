class_name Fmt
## Shared text formatting for kiosk screens.

const _WORDS := ["Zero", "One", "Two", "Three", "Four", "Five", "Six",
	"Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"]


## 180 -> "₹180"; 1250 -> "₹1,250".
static func rupees(amount: int) -> String:
	var digits := str(absi(amount))
	var grouped := ""
	while digits.length() > 3:
		grouped = "," + digits.right(3) + grouped
		digits = digits.left(digits.length() - 3)
	return ("-" if amount < 0 else "") + "₹" + digits + grouped


## 0..12 -> "Zero".."Twelve"; otherwise digits.
static func count_word(n: int) -> String:
	return _WORDS[n] if n >= 0 and n < _WORDS.size() else str(n)


## {"hour": 6, "minute": 42} -> "06:42 AM".
static func clock_12h(t: Dictionary) -> String:
	var hour: int = t.hour
	var suffix := "AM" if hour < 12 else "PM"
	var h12 := hour % 12
	if h12 == 0:
		h12 = 12
	return "%02d:%02d %s" % [h12, t.minute, suffix]


## Local time "2026-09-24 06:42 IST".
static func datetime_short(unix: float) -> String:
	var d := _local(unix)
	return "%04d-%02d-%02d %02d:%02d %s" % [d.year, d.month, d.day, d.hour, d.minute, zone_label()]


## Local time "06:11 IST".
static func time_short(unix: float) -> String:
	var d := _local(unix)
	return "%02d:%02d %s" % [d.hour, d.minute, zone_label()]


## <60 s -> "4 s ago"; <1 h -> "31 min ago"; else "2 h ago".
static func ago(seconds: float) -> String:
	var s := int(maxf(seconds, 0.0))
	if s < 60:
		return "%d s ago" % s
	if s < 3600:
		return "%d min ago" % (s / 60)
	return "%d h ago" % (s / 3600)


## "2026-09-24T00:41:00Z" (UTC) -> unix seconds; "" or malformed -> 0.0.
static func iso_to_unix(iso: String) -> float:
	var trimmed := iso.strip_edges().trim_suffix("Z")
	var re := RegEx.create_from_string("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$")
	if re.search(trimmed) == null:
		return 0.0
	return float(Time.get_unix_time_from_datetime_string(trimmed))


## System zone abbreviation when short (e.g. "IST"), else "UTC+05:30".
static func zone_label() -> String:
	var tz := Time.get_time_zone_from_system()
	var name: String = tz.get("name", "")
	if name.length() >= 2 and name.length() <= 5:
		return name
	var bias: int = tz.get("bias", 0)
	return "UTC%s%02d:%02d" % ["+" if bias >= 0 else "-", absi(bias) / 60, absi(bias) % 60]


static func _local(unix: float) -> Dictionary:
	var bias: int = Time.get_time_zone_from_system().get("bias", 0)
	return Time.get_datetime_dict_from_unix_time(int(unix) + bias * 60)
