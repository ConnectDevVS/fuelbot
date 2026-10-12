# PAY-01 — Order identity (ULID order ID + display order number)

**As an** operator analysing sales, **I want** every order to carry an ID that
is unique across the whole fleet, including orders that are never paid,
**so that** funnels and reconciliation work without coordination between
machines. **As a** customer, **I want** a short order number I can read out.

Plan refs: §0 decision log, §3.4.
Depends on: the details set (Proceed to Pay is the commitment point).

## Deliverables

```
autoload/OrderState.gd                  # + order_id, order_number
ui/ulid.gd                              # class_name Ulid (pure, testable)
autoload/OrderCounter.gd                # persisted display counter (autoload after OrderState)
project.godot                           # register OrderCounter above DevCapture
scenes/flavor_detail/flavor_detail.gd   # _proceed() assigns identity
config/local_settings.json              # + messages.order_number
tests/unit/test_order_identity.gd
```

## Spec

### `Ulid` (`ui/ulid.gd`, `class_name Ulid`)

A standard ULID: 26 characters of Crockford base32
(`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, with no I, L, O or U). The first 10
characters encode a 48-bit millisecond Unix timestamp, and the last 16 encode
80 random bits.

```gdscript
static func generate(unix_ms: int = -1) -> String   # -1 = now: int(Time.get_unix_time_from_system() * 1000)
static func timestamp_ms(ulid: String) -> int       # decode the first 10 chars
static func is_valid(ulid: String) -> bool          # 26 chars, all in the alphabet, first char <= '7'
```

- Randomness comes from `Crypto.new().generate_random_bytes(10)`, which is
  cryptographically secure. Don't use `randi()`: it's seeded and could collide
  across machines imaged identically.
- Encode with integer arithmetic. GDScript `int` is 64-bit, so encode the
  48-bit time as 10 × 5-bit groups and the 80 random bits in two parts (for
  example 40 + 40 bits). Don't use floats.
- Monotonicity within the same millisecond isn't required: order creation is
  human-paced.

### `OrderCounter` autoload

- Persists the next display number in `user://order_counter.txt` with the
  atomic write pattern (`.tmp` then `DirAccess.rename_absolute`).
- `func next() -> int`: reads the value (missing or unparseable → `1`),
  returns it, and persists value + 1. It wraps from 9999 back to 1 so the
  display stays 4 digits.
- `var counter_path := "user://order_counter.txt"` is overridable for tests.
- Registered **after** `OrderState`, **before** `DevCapture`.

### `OrderState`

Add these fields and clear them in `reset()`:

```gdscript
var order_id: String = ""      # ULID, analytics key (plan §3.4)
var order_number: int = 0      # display only
```

### `flavor_detail.gd::_proceed()`

After the existing orderable and base checks, before `Nav.go(PAYMENT)`:

```gdscript
OrderState.order_id = Ulid.generate()
OrderState.order_number = OrderCounter.next()
```

Proceed can be pressed once per order: the button is already disabled after
the first press, and Back resets the order. So an order never gets two IDs,
and returning to details and proceeding again produces a **new** order (a new
ID and number), which is correct for analytics.

### Display string

`local_settings.messages.order_number`: `"ORDER #{number}"`, where `number` is
`"%04d" % order_number`. Used by PAY-05.

## Acceptance criteria

`tests/unit/test_order_identity.gd`:
- [ ] `Ulid.generate()` is 26 characters and `is_valid()`; 1,000 generated
      IDs are all unique.
- [ ] `Ulid.timestamp_ms(Ulid.generate(1727170000123)) == 1727170000123`.
- [ ] Known vector: `Ulid.generate(0)` starts with `0000000000`;
      `Ulid.generate(281474976710655)` (max 48-bit) starts with `7ZZZZZZZZZ`.
- [ ] IDs generated 2 ms apart sort lexicographically in time order.
- [ ] `is_valid` rejects the wrong length, `I`/`L`/`O`/`U`, and a first char
      greater than `7`.
- [ ] `OrderCounter` with a test path: missing file → `next()` returns 1, then
      2, then 3. The value persists across a fresh instance. `9999` wraps to
      `1`. A corrupt file gives `1`.
- [ ] Details → `press_proceed()` for guava: `OrderState.order_id` is valid,
      `order_number > 0`, `Nav.last_requested == PAYMENT`. Back then Proceed
      again gives a **different** `order_id` and `order_number + 1`.
- [ ] `OrderState.reset()` clears `order_id` and `order_number`.
- [ ] `tools/run_tests.sh` and `tools/check_boot.sh` pass. The test must not
      touch the real `user://order_counter.txt`: use a test path, and
      snapshot/restore `OrderCounter.counter_path`.

## Out of scope

Sending the ID anywhere (PAY-03 puts it in the QR notes; sale report and
telemetry come in later milestones).
