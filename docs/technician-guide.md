# FuelBot technician guide

For FuelBot technicians at a machine. Nothing here needs a laptop.

## Connecting a machine to the gym's Wi-Fi

You need the machine's **settings PIN** (6 digits). Every machine has its
own; it's set when the machine is built. Ask FuelBot support if you don't
have it. Never write it on the machine.

Before you go, ask the gym for:

- the **network name** and **password** of a staff or IoT network;
- whether the guest Wi-Fi shows a **login page** ("accept terms"). The
  machine can't get past one: use another network, a cable, or a 4G router.
- whether staff log in with a **username and password**. The machine can't
  use those networks either.

### Steps

1. Make sure nobody is ordering. The screen must show the start screen
   ("Tap anywhere to start") or "Out of service".
2. **Press and hold the top-left corner** of the screen for 5 seconds. Keep
   your finger still. The PIN pad opens. (A quick tap there starts an order
   as usual: tap Back.)
3. Type the PIN. After **5 wrong tries the pad locks for 5 minutes**, even if
   the machine restarts.
4. Tap **Network**. The list shows the network the machine is on (top, with a
   tick and "FuelBot server reachable" or "not reachable"), then every network
   in range, strongest first. A lock means it needs a password.
5. Tap the gym's network, type the password on the on-screen keyboard
   (**⇧** for one capital, tap it twice for all capitals, **?123** for
   symbols, **Show** to check what you typed), then tap **Connect**.
6. Wait for **"Connected to <name>"**. The list comes back with that network
   on top. Check that it says **"FuelBot server reachable"**: if it says "not
   reachable", the gym's network blocks the machine (ask them to allow
   outgoing HTTPS).
7. Tap **Back**, then **Exit**. The machine goes back to the start screen by
   itself after a minute anyway.

If it fails, the message shows for 3 seconds and the machine **stays on the
network it had**:

| Message | What to do |
|---------|------------|
| Wrong password. Try again. | Re-type it; tap Show to check capitals |
| Network not found. Move closer or refresh. | Tap Refresh; check the gym's router is on |
| Couldn't connect in time. Try again. | Try again; if it keeps happening, the signal is too weak inside the cabinet |
| This network type isn't supported. | It needs a username: use another network, a cable or 4G |
| Couldn't search for networks. Tap Refresh. | Tap Refresh; if it repeats, restart the machine |
| This machine isn't allowed to change Wi-Fi. Call FuelBot support. | The machine was built without its Wi-Fi permission: call FuelBot support |
| Wi-Fi isn't available on this machine. | Call FuelBot support |

### Checking the connection later

When the machine is out of service, the diagnostics show the network, for
example `ONLINE · GymStaff 72%` (the signal in %), `ONLINE · CABLE`, or
`OFFLINE · NO NETWORK`. Below about 40 % the connection may drop: consider a
cable or a 4G router.
