// Host-only declaration for tools/check_firmware.sh.
#pragma once
#define WDTO_15MS 0
void wdt_enable(int timeout);
