// Host-only: in the simulator, wdt_enable() raises a watchdog reset (see sim.cpp).
#pragma once
#define WDTO_15MS 0
void wdt_enable(int timeout);
