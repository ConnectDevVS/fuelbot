#include <Arduino.h>
#include <avr/wdt.h>

// FuelBot dispenser, Arduino Mega. Ported from fuelbotsource_og/VM_code.ino;
// Milestone 4 changes are marked "// M4:" (devdocs/stories/dispensing/DSP-03),
// Milestone 5 changes "// M5:" (devdocs/stories/telemetry/TEL-02).
//
// Serial protocol (9600 baud), used by hardware/bridge/udprxtx.py:
//   in:  "<hopper><base>\n"   two digits, e.g. "12" = hopper 1, base 2 (water)
//   out (M5: every line is machine-parseable; the old free-text lines are gone):
//        "STATUS:BOOT"                      setup() started (power-on or watchdog reset)
//        "STATUS:HOMING_START" / "STATUS:HOMING_DONE"   homing began / limit switch reached
//        "STATUS:WATER_FILL_1_DONE", "STATUS:PROTEIN_DISPENSED <h>",
//        "STATUS:WATER_FILL_2_DONE", "STATUS:MIX_DONE"  cycle stages, in order
//        "STATUS:DONE"                      end of a completed cycle, just before the reset
//        "FAULT:HOMING_TIMEOUT"             no limit switch within HOMING_TIMEOUT_MS; motor stopped;
//                                           not homed, retried with back-off
//        "FAULT:NOT_HOMED"                  command received while not homed; nothing moves
//        "FAULT:HOPPER_UNASSIGNED <hopper>" hopper 5/6 without a wired motor; nothing moves
//        "FAULT:BAD_COMMAND"                anything else that isn't a valid command; nothing moves

void resetArduino()
{
  wdt_enable(WDTO_15MS);
  while (1) {}
}

#define M1 2
#define M2 3
#define M3 4
#define M4 5
// M4: hoppers 5-6. Wiring isn't final: -1 = unassigned, and such a hopper is refused
// with FAULT:HOPPER_UNASSIGNED (never drive pin -1). Positions/durations are placeholders.
#define M5 -1        // TODO(wiring): assign pin for hopper 5
#define M6 -1        // TODO(wiring): assign pin for hopper 6
#define M5_POS 72000 // TODO(wiring): placeholder stepper position
#define M6_POS 72000 // TODO(wiring): placeholder stepper position
#define M5_MS 1000   // TODO(wiring): placeholder dispense duration
#define M6_MS 1000   // TODO(wiring): placeholder dispense duration
#define PU 6
#define MIX 7

#define ENA 8
#define DIR 9
#define Z 10
#define X 11

#define LIMIT 22

// M5: bounded homing. Worst full-travel homing is ~8.5 s (77000 steps); 20 s is generous.
// On failure the board stays up, not homed, and retries after 1, 2, 4, 8, then every 10 min
// (not a reset loop, which would drive into the hard stop every ~20 s).
#define HOMING_TIMEOUT_MS 20000UL
#define HOMING_RETRY_MS 60000UL
#define HOMING_RETRY_MAX_MS 600000UL

int protein = 0;
int base = 0;

bool mix = false;
bool finished = false;

String last_received = "";

long currentPos = 0;

bool homed = false;                              // M5
unsigned long lastHomingFailure = 0;             // M5: millis() at the end of the failed attempt
unsigned long homingRetryMs = HOMING_RETRY_MS;   // M5: doubles per failure, capped

// M4: hoppers with a motor wired to a real pin.
bool hopperAssigned(int p)
{
  if (p >= 1 && p <= 4) return true;
  if (p == 5) return M5 >= 0;
  if (p == 6) return M6 >= 0;
  return false;
}

// M5: returns false (motor stopped, FAULT:HOMING_TIMEOUT, not homed) if the limit
// switch isn't reached within HOMING_TIMEOUT_MS. Was an unbounded wait.
bool homeAxis()
{
  Serial.println("STATUS:HOMING_START");  // M5: was "Homing"

  digitalWrite(ENA, HIGH);
  digitalWrite(DIR, HIGH);  // Move towards 0 (decreasing direction)

  unsigned long start = millis();  // M5
  while (digitalRead(LIMIT) == HIGH)  // Move until limit switch hit (active LOW)
  {
    if (millis() - start > HOMING_TIMEOUT_MS)  // M5
    {
      digitalWrite(ENA, LOW);
      homed = false;
      lastHomingFailure = millis();
      Serial.println("FAULT:HOMING_TIMEOUT");
      return false;
    }
    digitalWrite(X, HIGH);
    delayMicroseconds(50);
    digitalWrite(X, LOW);
    delayMicroseconds(50);
  }

  currentPos = 0;
  digitalWrite(ENA, LOW);
  homed = true;                        // M5
  homingRetryMs = HOMING_RETRY_MS;     // M5
  Serial.println("STATUS:HOMING_DONE");  // M5: was "Home reached"
  delay(500);
  return true;
}

void moveTo(long targetPos)
{
  digitalWrite(ENA, HIGH);
  long steps = targetPos - currentPos;

  if (steps > 0)
  {
    digitalWrite(DIR, LOW);
  }
  else
  {
    digitalWrite(DIR, HIGH);
    steps = -steps;
  }

  for (long i = 0; i < steps; i++)
  {
    digitalWrite(X, HIGH);
    delayMicroseconds(50);
    digitalWrite(X, LOW);
    delayMicroseconds(50);
  }

  currentPos = targetPos;
  digitalWrite(ENA, LOW);
}

void setup()
{
  pinMode(M1, OUTPUT);
  pinMode(M2, OUTPUT);
  pinMode(M3, OUTPUT);
  pinMode(M4, OUTPUT);
#if M5 >= 0
  pinMode(M5, OUTPUT);  // M4
#endif
#if M6 >= 0
  pinMode(M6, OUTPUT);  // M4
#endif
  pinMode(PU, OUTPUT);
  pinMode(MIX, OUTPUT);
  pinMode(DIR, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(Z, OUTPUT);
  pinMode(X, OUTPUT);

  pinMode(LIMIT, INPUT_PULLUP);  // Active LOW — internal pullup enabled

  digitalWrite(M1, HIGH);
  digitalWrite(M2, HIGH);
  digitalWrite(M3, HIGH);
  digitalWrite(M4, HIGH);
#if M5 >= 0
  digitalWrite(M5, HIGH);  // M4
#endif
#if M6 >= 0
  digitalWrite(M6, HIGH);  // M4
#endif
  digitalWrite(PU, HIGH);
  digitalWrite(MIX, LOW);

  finished = false;

  Serial.begin(9600);
  Serial.println("STATUS:BOOT");  // M5: was " " + "Reset!"

  homeAxis();  // Home at startup (M5: on failure, loop() retries with back-off)
//  for (int i = 0; i<=120; i++)
//      {
//        analogWrite(MIX, i);
//        delay(60);
//      }
//      delay(10000);
//      analogWrite(MIX, 0);
}

void loop()
{
  mix = false;

  // M5: not homed -> no cycle. Refuse commands; retry homing with back-off.
  if (!homed)
  {
    if (Serial.available() > 0)
    {
      String message = Serial.readStringUntil('\n');
      message.trim();
      if (message.length() > 0)
      {
        Serial.println("FAULT:NOT_HOMED");
      }
    }
    if (millis() - lastHomingFailure >= homingRetryMs && !homeAxis())
    {
      homingRetryMs = homingRetryMs * 2 > HOMING_RETRY_MAX_MS ? HOMING_RETRY_MAX_MS : homingRetryMs * 2;
    }
    return;
  }

  if (Serial.available() > 0)
  {
    String message = Serial.readStringUntil('\n');
    message.trim();
     
    if (message.length() == 2 && isDigit(message.charAt(0)) && isDigit(message.charAt(1)))
    {
      protein = message.charAt(0) - '0';
      base = message.charAt(1) - '0';
      last_received = message;

      // M4: validate before anything moves. An unknown hopper used to skip every
      // protein branch, never set mix, never reset, and refill water forever.
      if (protein >= 1 && protein <= 6 && !hopperAssigned(protein) && base >= 1 && base <= 2)
      {
        Serial.print("FAULT:HOPPER_UNASSIGNED ");
        Serial.println(protein);
        protein = 0;
        base = 0;
      }
      else if (protein < 1 || protein > 6 || base < 1 || base > 2)
      {
        Serial.println("FAULT:BAD_COMMAND");
        protein = 0;
        base = 0;
      }
    }
    else if (message.length() > 0)
    {
      Serial.println("FAULT:BAD_COMMAND");  // M4: was silently ignored
    }
  }

  if (protein != 0 && base != 0 && finished == false)
  {
    moveTo(26000);

    digitalWrite(PU, LOW);
    delay(4000);
    digitalWrite(PU, HIGH);
    delay(1000);
    Serial.println("STATUS:WATER_FILL_1_DONE");  // M5: was "Water Filled in Cup"
     
//    moveTo(4000);
     
//    digitalWrite(PU, LOW);
//    delay(3000);
//    digitalWrite(PU, HIGH);
//    delay(1000);
//    Serial.println("Water Filled in Sink");

    if (base == 1)
    {
//      moveTo(0);
//
//      digitalWrite(M1, LOW);
//      delay(3000);
//      Serial.println("Milk Powder Dispensed");
//      digitalWrite(M1, HIGH);
//      delay(1000);
    }

    else if (base == 2)
    {
      //Nothing
    }

    if (protein == 1) // pre
    {
      moveTo(0); // 0

      digitalWrite(M1, LOW);
      delay(1500);
      Serial.println("STATUS:PROTEIN_DISPENSED 1");  // M5: was "Protein 1 Dispensed"
      digitalWrite(M1, HIGH);
      delay(1000);

      mix = true;
    }
 
    else if (protein == 2) // coffee
    {
      moveTo(18000); // 18000

      digitalWrite(M2, LOW);
      delay(7500);
      Serial.println("STATUS:PROTEIN_DISPENSED 2");  // M5: was "Protein 2 Dispensed"
      digitalWrite(M2, HIGH);
      delay(1000);

      mix = true;
    }
 
    else if (protein == 3) // creatine
    {
      moveTo(36000); // 36000

      digitalWrite(M3, LOW);
      delay(500);
      Serial.println("STATUS:PROTEIN_DISPENSED 3");  // M5: was "Protein 3 Dispensed"
      digitalWrite(M3, HIGH);
      delay(1000);

      mix = true;
    }

    else if (protein == 4) // vanilla
    {
      moveTo(54000); // 54000

      digitalWrite(M4, LOW);
      delay(6000);
      Serial.println("STATUS:PROTEIN_DISPENSED 4");  // M5: was "Protein 4 Dispensed"
      digitalWrite(M4, HIGH);
      delay(1000);

      mix = true;
    }

#if M5 >= 0
    else if (protein == 5) // M4: TODO(wiring)
    {
      moveTo(M5_POS);

      digitalWrite(M5, LOW);
      delay(M5_MS);
      Serial.println("STATUS:PROTEIN_DISPENSED 5");  // M5: was "Protein 5 Dispensed"
      digitalWrite(M5, HIGH);
      delay(1000);

      mix = true;
    }
#endif

#if M6 >= 0
    else if (protein == 6) // M4: TODO(wiring)
    {
      moveTo(M6_POS);

      digitalWrite(M6, LOW);
      delay(M6_MS);
      Serial.println("STATUS:PROTEIN_DISPENSED 6");  // M5: was "Protein 6 Dispensed"
      digitalWrite(M6, HIGH);
      delay(1000);

      mix = true;
    }
#endif


    moveTo(26000);

    digitalWrite(PU, LOW);
    delay(5000);
    digitalWrite(PU, HIGH);
    delay(1000);
    Serial.println("STATUS:WATER_FILL_2_DONE");  // M5: was "Water Filled in Cup"
     
    if (mix == true)
    {
      moveTo(77000);
      delay(500);

      digitalWrite(ENA, HIGH);
      digitalWrite(DIR, HIGH);
       
      for (long i = 0; i < 30000; i++)
      {
        digitalWrite(Z, HIGH);
        delayMicroseconds(70);
        digitalWrite(Z, LOW);
        delayMicroseconds(70);
      }

      delay(500);

      for (int i = 0; i<=255; i++)
      {
        analogWrite(MIX, i);
        delay(40);
      }
      delay(15000);
      analogWrite(MIX, 0);

//      digitalWrite(MIX, LOW);
//      delay(15000);
//      digitalWrite(MIX, HIGH);
//      delay(800);
      Serial.println("STATUS:MIX_DONE");  // M5: was "Shake Frothing Done"

      digitalWrite(DIR, LOW);
       
      for (long i = 0; i < 30000; i++)
      {
        digitalWrite(Z, HIGH);
        delayMicroseconds(70);
        digitalWrite(Z, LOW);
        delayMicroseconds(70);
      }
      digitalWrite(ENA, LOW);
      delay(1000);
//
//      moveTo(54000);
//        
//      digitalWrite(ENA, HIGH);
//      digitalWrite(DIR, HIGH);
//        
//      for (long i = 0; i < 25000; i++)
//      {
//        digitalWrite(Z, HIGH);
//        delayMicroseconds(50);
//        digitalWrite(Z, LOW);
//        delayMicroseconds(50);
//      }
//
//      delay(500);
//
//      digitalWrite(MIX, LOW);
//      delay(5000);
//      digitalWrite(MIX, HIGH);
//      delay(800);
//      Serial.println("Frother Cleaned");
//
//      digitalWrite(DIR, LOW);
//        
//      for (long i = 0; i < 25000; i++)
//      {
//        digitalWrite(Z, HIGH);
//        delayMicroseconds(50);
//        digitalWrite(Z, LOW);
//        delayMicroseconds(50);
//      }
//      digitalWrite(ENA, LOW);

      moveTo(0);
      homeAxis();  // Verify home after final move. M5: a failure here keeps the drink
                   // (it's already mixed); STATUS:DONE still follows and setup() retries.

      mix = false;
      finished = true;
      Serial.println("STATUS:DONE");  // M4: end of cycle (plan §3.7). M5: "Mix Done" before it dropped
      Serial.flush();
      delay(100);
      resetArduino();
    }
  }
}
