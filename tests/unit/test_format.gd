extends TestCase


func test_rupees() -> void:
	assert_eq(Fmt.rupees(75), "₹75")
	assert_eq(Fmt.rupees(1250), "₹1,250")


func test_count_word() -> void:
	assert_eq(Fmt.count_word(4), "Four")
	assert_eq(Fmt.count_word(6), "Six")
	assert_eq(Fmt.count_word(13), "13")


func test_clock_12h() -> void:
	assert_eq(Fmt.clock_12h({"hour": 0, "minute": 5}), "12:05 AM")
	assert_eq(Fmt.clock_12h({"hour": 6, "minute": 42}), "06:42 AM")
	assert_eq(Fmt.clock_12h({"hour": 12, "minute": 0}), "12:00 PM")
	assert_eq(Fmt.clock_12h({"hour": 18, "minute": 30}), "06:30 PM")


func test_ago() -> void:
	assert_eq(Fmt.ago(4), "4 s ago")
	assert_eq(Fmt.ago(1860), "31 min ago")
	assert_eq(Fmt.ago(7300), "2 h ago")


func test_iso_to_unix() -> void:
	assert_eq(Fmt.iso_to_unix("1970-01-01T00:01:00Z"), 60.0)
	assert_eq(Fmt.iso_to_unix(""), 0.0)
	assert_eq(Fmt.iso_to_unix("not a date"), 0.0)


func test_datetime_and_time_short_shape() -> void:
	var re := RegEx.create_from_string("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} \\S+$")
	assert_true(re.search(Fmt.datetime_short(Time.get_unix_time_from_system())) != null, "datetime_short shape")
	assert_true(RegEx.create_from_string("^\\d{2}:\\d{2} \\S+$").search(Fmt.time_short(0)) != null, "time_short shape")
