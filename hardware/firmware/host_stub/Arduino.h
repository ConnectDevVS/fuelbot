// Host-only declarations for tools/check_firmware.sh (clang++ -fsyntax-only).
// Just enough of the Arduino core API for VM_code.ino to type-check; nothing links or runs.
#pragma once
#include <stdint.h>

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
bool isDigit(char c);

class String {
 public:
  String();
  String(const char* s);
  void trim();
  unsigned int length() const;
  char charAt(unsigned int index) const;
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
