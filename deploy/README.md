# Deploying FuelBot on a machine (Raspberry Pi)

The full machine build (the Pi image, systemd units, `provision.sh`, the
updater) comes with Milestone 8 and the OTA set
([docs/stories/ota/OTA-08-pi-image.md](../docs/stories/ota/OTA-08-pi-image.md)),
and this file becomes its step-by-step guide. Until then it covers what's
built: **the Wi-Fi settings on a real Pi.**

## Wi-Fi settings on a Raspberry Pi

The kiosk's settings screen (hold the top-left corner 5 s → PIN → Network)
drives NetworkManager through `nmcli`, as the kiosk user, without root. On a
Mac it runs against a stand-in (`kiosk/tools/fake_nmcli.py`); on a Pi it
runs the real `nmcli`. These steps set a Pi up for it and check what only a
Pi can prove. Design: [docs/stories/settings/](../docs/stories/settings/README.md).

### What you need

- A Raspberry Pi 4 or 5 with **Raspberry Pi OS Bookworm, 64-bit**. Its
  network manager is NetworkManager, so `nmcli` is already installed.
- The touchscreen, a USB keyboard for the setup, and a phone to share a
  **hotspot** (a network you control, to test with).
- This repo on the Pi, and Godot 4.7 for Linux arm64 (until the Milestone 8
  export exists, run the project from source).

### Set up

Commands run from the repo root on the Pi.

1. **Set the Wi-Fi country.** Bookworm keeps Wi-Fi blocked until it's set:

   ```bash
   sudo raspi-config nonint do_wifi_country IN
   nmcli radio wifi          # must say: enabled
   ```

2. **Create the kiosk user** (Milestone 8 runs the app as `fuelbot`; the
   polkit rule names this user, so change both together if it differs):

   ```bash
   sudo adduser --disabled-password --gecos "" fuelbot
   ```

3. **Install the polkit rule** that lets `fuelbot` manage Wi-Fi, nothing
   else:

   ```bash
   sudo install -m 644 deploy/polkit/50-fuelbot-wifi.rules /etc/polkit-1/rules.d/
   sudo systemctl restart polkit
   sudo -u fuelbot nmcli device wifi rescan && echo "rule works"
   ```

   Without the rule the last command says `Error: Not authorized to control
   networking.` (and the settings screen says "This machine isn't allowed to
   change Wi-Fi").

4. **Set the settings PIN** (part of the machine's identity; asked twice,
   stored only as a hash; never overwrites an existing one):

   ```bash
   USER_DIR=/home/fuelbot/.local/share/godot/app_userdata/FuelBot
   sudo -u fuelbot mkdir -p "$USER_DIR"
   sudo -u fuelbot env FUELBOT_USER_DIR="$USER_DIR" kiosk/tools/set_settings_pin.sh
   ```

5. **Run the app as `fuelbot` with the real `nmcli`.** Nothing to configure:
   the default `wifi.nmcli_path` is `nmcli`. Don't run `tools/dev_setup.gd`
   with its default (`--wifi=fake`) on a Pi; if you use `tools/dev_run.sh`
   there, pass `--wifi=real`.

### Check it (the open items in the settings SIGNOFF)

Record each result in the **"Real Pi"** table of
[docs/stories/settings/SIGNOFF.md](../docs/stories/settings/SIGNOFF.md),
with the date and the Pi model.

1. **The password reaches NetworkManager and is saved** (SET-01's spike).
   From the screen, connect to your phone's hotspot (Network → hotspot →
   password → Connect). It should say "Connected to <name>". Then:

   ```bash
   sudo nmcli -s -g 802-11-wireless-security.psk connection show "<hotspot name>"   # prints the password: saved
   sudo journalctl -u NetworkManager --since "10 min ago" | grep -c "<the password>" # 0
   ```

   While a connect is in progress, `ps -ef | grep [n]mcli` shows
   `passwd-file …/wifi_secret.tmp`, never the password. If the password is
   **not** saved, or NetworkManager refused to add the profile, stop and
   report it: the fix is in one place (`_connect_steps` in
   `kiosk/autoload/Wifi.gd`, switching to `nmcli --ask`) and is a decision
   for the product owner.
2. **The machine is online**: the list says "FuelBot server reachable" and
   the dashboard shows the machine online (needs the backend and a
   provisioned identity).
3. **Reboot.** It reconnects to the hotspot by itself; "Out of service"
   diagnostics (if shown) say `ONLINE · <hotspot> <signal>%`.
4. **Wrong password.** Connect to the hotspot with a wrong password: "Wrong
   password" for 3 s, and the machine is still on the network it had.
   `nmcli connection show` lists no new profile.
5. **Without the rule.** Move the rule away, restart polkit, open the
   network list: "This machine isn't allowed to change Wi-Fi", no crash.
   Put the rule back and restart polkit.
6. **Touch feel.** The keys, rows and PIN pad are easy to hit at arm's
   length; the screen doesn't stutter while it searches for networks.

### If something's wrong

| You see | Check |
|---------|-------|
| "Wi-Fi isn't available on this machine." | `which nmcli`; the app runs with the real `nmcli` (not `--wifi=fake`) |
| "This machine isn't allowed to change Wi-Fi." | the polkit rule is installed and names the user the app runs as |
| No networks, or "Couldn't search for networks" | `nmcli radio wifi` is enabled; the Wi-Fi country is set (step 1) |
| "Settings not set up on this machine." | `settings_pin.txt` exists in the app's user folder (step 4) |
| Anything else | the app's log lines starting `[Wifi]` (never contain a password) |
