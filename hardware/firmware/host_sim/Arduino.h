// Host-only Arduino API for the firmware simulator (sim.cpp) and the syntax check
// (tools/check_firmware.sh). Declarations only; sim.cpp implements them against a
// simulated board. Just enough of the core for VM_code.ino.
#pragma once
#include <stdint.h>
#include <string>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

void pinMode(int pin, int mode);
void digitalWrite(int pin, int value);
int digitalRead(int pin);
void analogWrite(int pin, int value);
void delay(unsigned long ms);
void delayMicroseconds(unsigned int us);
unsigned long millis();
bool isDigit(char c);

class String {
 public:
  std::string s;
  String() {}
  String(const char* c) : s(c) {}
  void trim();
  unsigned int length() const { return (unsigned int)s.size(); }
  char charAt(unsigned int i) const { return i < s.size() ? s[i] : 0; }
};

class HardwareSerial {
 public:
  void begin(unsigned long baud);
  int available();
  String readStringUntil(char terminator);
  void print(const char* s);
  void print(int n);
  void println(const char* s);
  void println(const String& s);
  void println(int n);
  void flush();
};
extern HardwareSerial Serial;
