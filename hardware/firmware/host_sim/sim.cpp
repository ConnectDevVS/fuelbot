// Firmware host simulator: runs hardware/firmware/VM_code.ino against a simulated
// Arduino Mega + machine (devdocs/stories/telemetry/TEL-01). Not an AVR emulator:
// time is delay() arithmetic; registers and interrupts aren't modelled.
//
//   sim [--start-pos N] [--broken-limit FROM:TO]... [--at T:LINE]... [--until S] [--max-boots N]
//
// Output: "<t seconds>\t<serial line>" per line, "<t>\t<watchdog reset>" on reset, then
// "END\tcarriage=<n>\tena=<0|1>\tlow_writes=<pin>:<n>,...\tmix_pwm=<n>\tz_steps=<n>".
#include "Arduino.h"
#include <avr/wdt.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <map>
#include <utility>
#include <vector>

namespace sim {
double now_us = 0;                                  // virtual clock
long carriage = 0;                                   // X position in steps (physical: survives resets)
const long HARD_STOP = -500;                         // the rail ends just past the switch
std::vector<std::pair<double, double> > broken;      // limit switch dead in [from, to) seconds
std::deque<std::pair<double, std::string> > rx;      // (available at seconds, line)
std::map<int, int> pins, low_writes;
long mix_pwm_writes = 0, z_steps = 0;
std::string out_line;
double until_us = 400e6;                            // stop point, enforced by the clock itself
struct Reset {};
struct Stop {};                                      // --until reached (even inside a busy-wait)

void advance(double us) {
  now_us += us;
  if (now_us > until_us) throw Stop();
}

bool limit_broken() {
  double t = now_us / 1e6;
  for (size_t i = 0; i < broken.size(); i++)
    if (t >= broken[i].first && t < broken[i].second) return true;
  return false;
}
void emit(const std::string& text, bool newline) {
  out_line += text;
  if (newline) {
    printf("%.3f\t%s\n", now_us / 1e6, out_line.c_str());
    out_line.clear();
  }
}
}  // namespace sim

// Pin map (VM_code.ino): M1-M4 2-5, PU 6, MIX 7, ENA 8, DIR 9, Z 10, X 11, LIMIT 22.
void pinMode(int, int) {}
void digitalWrite(int pin, int value) {
  using namespace sim;
  if (value == HIGH && pins[pin] != HIGH && pins[8] == HIGH) {  // rising step edge, driver enabled
    if (pin == 11) {
      carriage += pins[9] == HIGH ? -1 : 1;  // DIR HIGH = towards home
      if (carriage < HARD_STOP) carriage = HARD_STOP;
    } else if (pin == 10) {
      z_steps++;
    }
  }
  if (value == LOW && pin >= 2 && pin <= 6) low_writes[pin]++;
  pins[pin] = value;
}
int digitalRead(int pin) {
  using namespace sim;
  if (pin == 22) return (!limit_broken() && carriage <= 0) ? LOW : HIGH;
  return pins[pin];
}
void analogWrite(int pin, int value) {
  if (pin == 7 && value > 0) sim::mix_pwm_writes++;
  sim::pins[pin] = value;
}
void delay(unsigned long ms) { sim::advance(ms * 1000.0); }
void delayMicroseconds(unsigned int us) { sim::advance(us); }
unsigned long millis() { return (unsigned long)(sim::now_us / 1000.0); }
bool isDigit(char c) { return c >= '0' && c <= '9'; }
void String::trim() {
  while (!s.empty() && (s[s.size() - 1] == '\r' || s[s.size() - 1] == ' ')) s.erase(s.size() - 1);
  while (!s.empty() && s[0] == ' ') s.erase(0, 1);
}
HardwareSerial Serial;
void HardwareSerial::begin(unsigned long) {}
int HardwareSerial::available() { return (!sim::rx.empty() && sim::rx.front().first * 1e6 <= sim::now_us) ? 1 : 0; }
String HardwareSerial::readStringUntil(char) {
  String r;
  if (available()) { r.s = sim::rx.front().second; sim::rx.pop_front(); }
  return r;
}
void HardwareSerial::print(const char* s) { sim::emit(s, false); }
void HardwareSerial::print(int n) { sim::emit(std::to_string(n), false); }
void HardwareSerial::println(const char* s) { sim::emit(s, true); }
void HardwareSerial::println(const String& s) { sim::emit(s.s, true); }
void HardwareSerial::println(int n) { sim::emit(std::to_string(n), true); }
void HardwareSerial::flush() {}
void wdt_enable(int) { throw sim::Reset(); }

// The sketch as a struct: a fresh Board per boot = RAM re-initialised, like a real reset.
struct Board {
#include "../VM_code.ino"
};

int main(int argc, char** argv) {
  using namespace sim;
  double until = 400;
  int max_boots = 20;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    std::string v = i + 1 < argc ? argv[i + 1] : "";
    if (a == "--start-pos") { carriage = atol(v.c_str()); i++; }
    else if (a == "--until") { until = atof(v.c_str()); i++; }
    else if (a == "--max-boots") { max_boots = atoi(v.c_str()); i++; }
    else if (a == "--broken-limit") {
      size_t c = v.find(':');
      broken.push_back(std::make_pair(atof(v.substr(0, c).c_str()), atof(v.substr(c + 1).c_str())));
      i++;
    } else if (a == "--at") {
      size_t c = v.find(':');
      rx.push_back(std::make_pair(atof(v.substr(0, c).c_str()), v.substr(c + 1)));
      i++;
    } else {
      fprintf(stderr, "unknown argument %s\n", a.c_str());
      return 2;
    }
  }
  until_us = until * 1e6;
  try {
    for (int boot = 0; boot < max_boots; boot++) {
      Board board;
      try {
        board.setup();
        for (;;) {
          double before = now_us;
          board.loop();
          if (now_us == before) advance(1000);  // an idle loop() pass costs ~1 ms of virtual time
        }
      } catch (Reset&) {
        emit("<watchdog reset>", true);
        advance(1000);  // the watchdog fires ~15 ms later; the bootloader is not modelled
      }
    }
  } catch (Stop&) {
  }
  printf("END\tcarriage=%ld\tena=%d\tlow_writes=", carriage, pins[8] == HIGH ? 1 : 0);
  for (int p = 2; p <= 6; p++) printf("%d:%d%s", p, low_writes[p], p < 6 ? "," : "");
  printf("\tmix_pwm=%ld\tz_steps=%ld\n", mix_pwm_writes, z_steps);
  return 0;
}
