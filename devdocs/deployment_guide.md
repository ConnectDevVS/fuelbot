# FuelBot server deployment guide

How to put the FuelBot backend and web dashboard on a new Linux server, from an
empty machine to a dashboard you can sign in to and a kiosk that talks to it.
Written from the first staging deployment (October 2026: AWS EC2, Ubuntu,
MongoDB Atlas, an nginx shared with other sites, pm2).

**What gets deployed.** One Node.js process (`server/`) serves everything on
one port:

| Path | What |
|---|---|
| `/fuelbot/…` | the kiosk API (config, sales, telemetry), called by the vending machines |
| `/api/v1/…` | the admin API, called by the dashboard |
| `/dashboard/…` | the web dashboard: static files built from `webdashboard/` into `webdashboard/dist/` |
| `/healthz` | health check (`{"ok":true}` when the database is reachable) |

nginx sits in front for HTTPS and passes every request to that port. The
database is MongoDB Atlas. The kiosk app, bridge and firmware run on the
machines and are **not** part of this deployment.

**Conventions in this guide**

- Commands marked **(server)** run on the server over SSH; **(Mac)** on your
  own computer, in the repo folder.
- Replace `<…>` placeholders with your values. The ones used throughout:

  | Placeholder | Example (staging) |
  |---|---|
  | `<domain>` | `gmrfuelbot.staging.griffinmarkapps.com` |
  | `<server-ip>` | `3.108.87.242` |
  | `<ssh-user>` | `ubuntu` (AWS Ubuntu images) |
  | `<port>` | `3001` (whatever nginx forwards to; `8790` if you choose) |
  | `<env-file>` | `.env.dev` (staging) or `.env.production` |
  | `<app-name>` | `fuelbot-dev` (staging) or `fuelbot` (production) |

- The app runs as a dedicated **`fuelbot`** user that can't log in. You run
  its commands with `sudo -u fuelbot -H …`.
- **Start every SSH session with `cd /tmp`.** `sudo -u fuelbot` keeps your
  current folder, and `fuelbot` isn't allowed into your home folder
  (`/home/ubuntu`), so pm2 and npm fail there with `EACCES`. Every user can
  enter `/tmp`. (Your login account can't enter `/opt/fuelbot` either.)
- **Secrets never go into git, chat or a command line**: the Atlas password,
  `JWT_SECRET`, admin passwords and machine keys live only in the env file
  on the server, a password manager, or the kiosk.

---

## 0. Before you start

You need:

1. **A Linux server** (Ubuntu 22.04 or 24.04) with SSH access and a static IP.
   At least 1 GB RAM for testing (2 GB+ for production).
2. **A domain** pointing at the server's IP (an `A` record). Without one you
   can't have HTTPS, and dashboard sign-in needs it in production.
3. **A MongoDB Atlas cluster**, with:
   - a **database user** with *readWrite* on this deployment's database only
     (not an Atlas admin). A password of letters and digits avoids URL
     encoding;
   - **Network Access**: the server's IP added (`<server-ip>/32`). Never
     `0.0.0.0/0`.
   - **Backups** turned on (Flex/M10+; the free M0 tier has none and isn't
     for production).
   - One database per environment: `fuelbot_dev` for staging, `fuelbot` for
     production, ideally on separate clusters.
4. **Admin access to the GitHub repo** (`ConnectDevVS/fuelbot`) to add a
   deploy key.
5. **The code pushed to GitHub** on the branch you'll deploy (step 3).

Pick the branch: staging follows **`develop`**, production follows **`main`**.

---

## 1. Prepare the server (server)

### 1.1 Packages and swap

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates git
free -h
```

If the server has about 1 GB of RAM or less, **add swap first**. Without it,
installing Node and running `npm ci` get killed (`Killed`,
`subprocess was killed by signal`):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                       # Swap: 2.0Gi
```

### 1.2 Node.js 22

The server needs **Node 22 or newer**. Don't use Ubuntu's own `nodejs`
package (it's 18 or older); use NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version                # v22.x
which node                    # /usr/bin/node
```

If `node --version` still shows an old version, remove Ubuntu's package
(`sudo apt remove -y nodejs libnode-dev && sudo apt autoremove -y`) and
install again. If an install fails half way, clean up with
`sudo rm -f /var/cache/apt/archives/nodejs_*.deb && sudo dpkg --configure -a && sudo apt -f install -y`.

### 1.3 The service user

```bash
sudo adduser --system --group --home /opt/fuelbot --shell /usr/sbin/nologin fuelbot
id fuelbot
```

### 1.4 Firewall

**Allow SSH before enabling the firewall**, or you lock yourself out:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

On **AWS EC2**, the instance's **security group** must also allow inbound
**HTTP (80)** and **HTTPS (443)** from anywhere. Keep SSH (22) as it is, and
**never open the app's port** (`<port>`): only nginx talks to it.

### 1.5 pm2

```bash
sudo npm install -g pm2
pm2 --version
```

---

## 2. Give the server read access to GitHub (server + GitHub)

The repo is private. A **deploy key** is an SSH key that can read this one
repo and nothing else.

```bash
cd /tmp
sudo -u fuelbot mkdir -p /opt/fuelbot/.ssh
sudo -u fuelbot ssh-keygen -t ed25519 -N "" -C "fuelbot-<environment>-server" -f /opt/fuelbot/.ssh/id_ed25519
sudo cat /opt/fuelbot/.ssh/id_ed25519.pub
```

Copy **only** the one line the last command prints
(`ssh-ed25519 AAAA… fuelbot-…-server`), not the picture `ssh-keygen` drew.
The file without `.pub` is the private key: it never leaves the server.

On GitHub: **repo → Settings → Deploy keys → Add deploy key**. Paste the
line, give it a title, and **leave "Allow write access" unticked**: the
server only reads.

Test it:

```bash
sudo -u fuelbot ssh -o StrictHostKeyChecking=accept-new -T git@github.com
# Hi ConnectDevVS/fuelbot! You've successfully authenticated, but GitHub does not provide shell access.
```

---

## 3. Get the code and build it (server)

### 3.1 Clone

```bash
cd /tmp
sudo -u fuelbot -H git clone -b <branch> git@github.com:ConnectDevVS/fuelbot.git /opt/fuelbot/app
sudo -u fuelbot -H git -C /opt/fuelbot/app log --oneline -1     # the commit you're deploying
```

`<branch>` is `develop` for staging, `main` for production.

### 3.2 Build the dashboard and install the server

```bash
sudo chown -R fuelbot:fuelbot /opt/fuelbot
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app/webdashboard && npm ci && npm run build'
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app/server && npm ci --omit=dev'
```

- `npm ci` installs exactly the versions in `package-lock.json`, so the
  server runs what was tested.
- The dashboard needs its build tools (plain `npm ci`); `npm run build`
  writes `webdashboard/dist/`, which the server serves at `/dashboard/`. It
  ends with `✓ built in …`.
- The server skips test-only packages (`--omit=dev`), including one that
  downloads a whole MongoDB.

Check:

```bash
sudo ls /opt/fuelbot/app/webdashboard/dist/index.html
sudo ls /opt/fuelbot/app/server/node_modules | wc -l      # more than 100
```

---

## 4. Create the environment file (server)

All settings come from one env file in `server/`. It is **gitignored** (every
`.env*` except `.env.example`), so `git pull` never creates or updates it:
you write it by hand on each server, and add any new setting by hand when a
release introduces one.

`server/.env.example` lists every setting with its default. The npm scripts
and pm2 pick the file with `ENV_FILE=<env-file>`; if that file is missing
they stop with `ENV_FILE not found` instead of running on dev defaults.

### 4.1 Write it

```bash
cd /tmp
openssl rand -hex 48          # copy this for JWT_SECRET (a new value per server)
sudo -u fuelbot nano /opt/fuelbot/app/server/<env-file>
```

**Staging** (`.env.dev`):

```ini
PORT=<port>
HOST=127.0.0.1
PUBLIC_URL=https://<domain>

MONGO_URL=mongodb+srv://<db-user>:<db-password>@<cluster>.mongodb.net/fuelbot_dev?retryWrites=true&w=majority

JWT_SECRET=<output of openssl rand -hex 48>
COOKIE_SECURE=true
SESSION_HOURS=48
LOGIN_RATE_LIMIT=10

MACHINE_AUTH=required
OFFLINE_AFTER_SEC=300
DISPLAY_TZ=Asia/Kolkata
STOCK_LOW_PORTIONS=15

STORAGE=local
LOG_REQUESTS=true

ENV_LABEL=staging
```

**Production** (`.env.production`), the same with these differences:

```ini
NODE_ENV=production
MONGO_URL=mongodb+srv://…/fuelbot?retryWrites=true&w=majority
# no ENV_LABEL line
```

Notes on the values:

| Setting | Why |
|---|---|
| `HOST=127.0.0.1` | only nginx on the same machine can reach the app; it trusts proxy headers from loopback only |
| `PORT` | must match the port nginx forwards to (step 6) |
| `PUBLIC_URL` | `https://` and **no trailing `/`**; used to build image links |
| `MONGO_URL` | the database name goes **between `.net/` and `?`**; without it data lands in `test`. URL-encode `@ : / ? # %` in the password (`@` → `%40`) |
| `JWT_SECRET` | keeps dashboard sign-ins valid across restarts; a different value per server |
| `COOKIE_SECURE=true` | session cookies only over HTTPS (production mode sets it by default) |
| `NODE_ENV=production` | production only: refuses to start without `JWT_SECRET`, turns on secure cookies and an extra CSP rule, and makes `npm run seed` refuse |
| `ENV_LABEL` | a tag (e.g. `staging`) shown bottom left on the sign-in page; letters, digits, space `. _ -`, at most 24 characters. Leave it out in production |
| `MACHINE_AUTH=required` | machines must send their key |

Save in nano with `Ctrl+O`, `Enter`, `Ctrl+X`, then lock the file down:

```bash
sudo chmod 600 /opt/fuelbot/app/server/<env-file>
sudo ls -la /opt/fuelbot/app/server/<env-file>          # -rw------- fuelbot fuelbot
sudo grep -E '^(PORT|PUBLIC_URL|ENV_LABEL|NODE_ENV)=' /opt/fuelbot/app/server/<env-file>
```

(Copying the file from a Mac with `scp` also works:
`scp server/.env <ssh-user>@<server-ip>:/tmp/<env-file>`, with the same `-i`
key you use for `ssh`; then `sudo mv` it into place, `chown fuelbot:fuelbot`
and `chmod 600`. Writing it on the server is simpler and lets you set the
server's own values.)

### 4.2 Check the database connection

```bash
cd /tmp
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app/server && ENV_FILE=<env-file> timeout 20 npm start' &
sleep 8 && curl -s http://127.0.0.1:<port>/healthz; echo
```

`{"ok":true}` = connected to Atlas. It stops by itself after 20 s.

| You see | Cause |
|---|---|
| hangs, or `MongoServerSelectionError` | the server's IP isn't in Atlas Network Access |
| `bad auth` / `authentication failed` | wrong user or password in `MONGO_URL`, or a character that needed URL encoding |
| `ENV_FILE not found` | the file isn't at `/opt/fuelbot/app/server/<env-file>` |
| `JWT_SECRET is required` | production mode without `JWT_SECRET` |
| `ENV_LABEL: …` | the label has a character that isn't allowed |

---

## 5. Run it with pm2 (server)

### 5.1 The pm2 config

Keep it outside the repo, so `git pull` never touches it:

```bash
cd /tmp
sudo -u fuelbot nano /opt/fuelbot/ecosystem.config.cjs
```

```js
module.exports = {
  apps: [
    {
      name: '<app-name>',
      cwd: '/opt/fuelbot/app/server',
      script: 'src/index.js',
      node_args: '--import ./src/env.js',
      env: { ENV_FILE: '<env-file>' },
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      time: true,
    },
  ],
};
```

- `node_args` + `ENV_FILE` load the env file exactly as `npm start` does.
- **One instance, fork mode.** The sign-in rate limiter keeps its counts in
  memory; several instances would each keep their own.

### 5.2 Start it, and start it on boot

```bash
cd /tmp
sudo -u fuelbot -H pm2 start /opt/fuelbot/ecosystem.config.cjs
sudo -u fuelbot -H pm2 status                     # <app-name>: online
curl -s http://127.0.0.1:<port>/healthz; echo     # {"ok":true}

sudo -u fuelbot -H pm2 save
sudo pm2 startup systemd -u fuelbot --hp /opt/fuelbot   # creates the pm2-fuelbot boot service
```

### 5.3 Log rotation

```bash
sudo -u fuelbot -H pm2 install pm2-logrotate
sudo -u fuelbot -H pm2 set pm2-logrotate:max_size 10M
sudo -u fuelbot -H pm2 set pm2-logrotate:retain 14
```

### 5.4 Everyday commands

Always with `sudo -u fuelbot -H` (from `/tmp`). Plain `pm2` shows *your*
account's empty pm2, not the app's.

```bash
sudo -u fuelbot -H pm2 status
sudo -u fuelbot -H pm2 logs <app-name>                     # live (Ctrl+C to stop)
sudo -u fuelbot -H pm2 logs <app-name> --lines 50 --nostream
sudo -u fuelbot -H pm2 restart <app-name>                  # after editing the env file or deploying
```

---

## 6. nginx and HTTPS (server)

nginx may already serve other sites on this server. **Look before you
change anything**, and never replace a file you didn't write.

### 6.1 See what exists

```bash
ls -la /etc/nginx/sites-enabled/ /etc/nginx/conf.d/
sudo nginx -T 2>/dev/null | grep -nE "^# configuration file|server_name|listen|proxy_pass|default_server"
sudo nginx -T 2>/dev/null | grep -n "<domain>"
sudo ss -ltnp | grep -E ':80 |:443 |:<port> '
```

- **A `server` block for `<domain>` already exists** (as on the first staging
  server, where one shared file held every site and staging already had
  HTTPS and forwarded to `localhost:3001`): don't add a second one. Either
  set `PORT` in the env file to the port its `proxy_pass` uses (no nginx
  change; check nothing else listens there), or edit that block's
  `proxy_pass`. Ask whoever owns the file first.
- **Nothing for `<domain>` yet**: add your own file (6.2).
- If `ss` shows another program on `<port>`, pick another port.

### 6.2 Add a site (only if none exists for `<domain>`)

Use a file name that doesn't exist yet:

```bash
ls /etc/nginx/sites-available/
sudo nano /etc/nginx/sites-available/fuelbot-<environment>
```

```nginx
server {
    listen 80;
    server_name <domain>;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:<port>;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Use `server_name <domain>`, not `default_server`, and don't remove other
sites (including `default`) on a shared server.

```bash
sudo ln -s /etc/nginx/sites-available/fuelbot-<environment> /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` checks every site: only reload when it says `successful`.

### 6.3 HTTPS

```bash
dig +short <domain>                                   # must print <server-ip>
sudo apt install -y certbot python3-certbot-nginx     # if not installed
sudo certbot --nginx -d <domain> --redirect
```

certbot adds the 443 block and an HTTP → HTTPS redirect, and renews
automatically. Skip it if `<domain>` already has a certificate (6.1).

Don't add security headers or a CSP in nginx: the app sets its own, and the
dashboard's carries a per-request nonce that an nginx header would break.

### 6.4 Check from outside

```bash
curl -s https://<domain>/healthz          # {"ok":true}
curl -sI http://<domain>/ | head -3       # 301 to https://
```

| You see | Cause |
|---|---|
| timeout | AWS security group or ufw blocks 80/443 |
| `502 Bad Gateway` | nginx works, the app doesn't answer on the port nginx uses: check `pm2 status`, `PORT` in the env file, `proxy_pass` |
| nginx's welcome page or another site | `server_name` doesn't match, or another block catches the domain |

Open `https://<domain>/dashboard/`: the sign-in page (with the `ENV_LABEL`
tag bottom left on staging).

---

## 7. Create the first admin (server)

```bash
cd /tmp
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app/server && ENV_FILE=<env-file> npm run create-admin -- --email=<you@company.com> --name="<Your Name>"'
```

It asks for the password twice, hidden (10 characters or more). Never pass
it on the command line. This is a **platform admin** (FuelBot staff: every
tenant and machine); run it again for each staff member. Tenant users are
created later in the dashboard (**Users**).

Sign in at `https://<domain>/dashboard/`.

---

## 8. Data: seed (staging only) or set up by hand

### 8.1 Seed (staging/dev only)

```bash
cd /tmp
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app/server && ENV_FILE=<env-file> npm run seed'
```

It creates tenant `powerfuel` (PowerFuel Gym), products and a menu from the
mock server's default catalog (no image URLs), and machine **`DEV00001`**
with the **dev key**, which is published in the repo. Running it again
updates in place.

- It **refuses** when `NODE_ENV=production`. **Never seed production.**
- On a server reachable from the internet, **replace the dev key straight
  away**: dashboard → **Machines → DEV00001 → Keys** → revoke the
  "dev seed" key → issue a new key (shown once; copy it straight to the
  kiosk). Otherwise anyone who has seen the repo can post sales and
  telemetry as that machine.

### 8.2 By hand (production; also fine for staging)

In the dashboard, as the admin:

1. **Tenants → New tenant** (the company, e.g. `powerfuel`).
2. **Products**: the drinks, prices, nutrition. Leave image URLs empty until
   the S3 bucket exists (the kiosk accepts only `https://` image links and
   falls back to its bundled images).
3. **Machines → Register**: the card shows the **tenant**, **machine ID** and
   **machine key**. **The key is shown once**: put it straight on the kiosk
   or into a password manager.
4. The machine's **Menu** tab: products on hoppers 1–4 (hoppers 5–6 aren't
   wired yet), then save.

### 8.3 Connect a kiosk (on the kiosk computer)

Run this on the computer running the kiosk app (a Mac in development, the
machine's Raspberry Pi later), in the repo folder, **not** on the server:

```bash
godot --headless --path . --script res://tools/dev_setup.gd -- \
  --tenant=<tenant> --machine=<MACHINE_ID> --machine-key=<KEY> \
  --api=https://<domain>/fuelbot \
  --razorpay-api=http://127.0.0.1:8787
```

It writes the tenant, machine ID, key and server address into the app's
data folder. `--razorpay-api` sends payments to the local mock (below).

Start the kiosk **directly** (`tools/dev_run.sh` would reset it to local
dev settings):

```bash
python3 mockserver/server.py --port 8787 &            # fake Razorpay
python3 tools/fake_dispense_bridge.py --mode done &   # fake machine (omit on real hardware)
godot --path .
```

**Mock payments.** The mock answers "pending" until told otherwise:

```bash
mockserver/scenario.sh paid '/v1/payments/qr_codes/{qr_id}/payments'          # paid at once
mockserver/scenario.sh paid_after_3 '/v1/payments/qr_codes/{qr_id}/payments'  # paid on the 4th check
mockserver/scenario.sh failed '/v1/payments/qr_codes/{qr_id}/payments'
mockserver/scenario.sh reset
```

Keep the quotes (`{qr_id}` is part of the route name). The mock's QR isn't
scannable, and it always "captures" ₹75 (the kiosk logs a mismatch warning
for other prices and dispenses anyway). Real Razorpay test mode is a
separate check: root `CLAUDE.md`, "Razorpay test-mode run".

**Check:** the kiosk shows the dashboard's menu; the machine shows
**Online** in the dashboard; an order appears under **Sales** after Refresh
and the hopper's stock drops by one portion.

---

## 9. Deploying an update (server)

First push the commits to the branch the server follows (staging:
`develop`, production: `main`). Then:

```bash
cd /tmp
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app && git pull \
  && cd webdashboard && npm ci && npm run build \
  && cd ../server && npm ci --omit=dev'
sudo -u fuelbot -H pm2 restart <app-name>
curl -s https://<domain>/healthz; echo
```

All three parts matter: without the build, browsers keep the old
dashboard; without the restart, the old server code keeps running.

If the release notes or `server/.env.example` add a setting, add it to the
env file by hand before the restart.

**Switch the branch** a server follows:

```bash
cd /tmp
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app && git fetch origin && git checkout <branch> && git pull'
```

then the build/install/restart above.

**Roll back** to the previous commit:

```bash
sudo -u fuelbot -H git -C /opt/fuelbot/app log --oneline -5
sudo -u fuelbot -H bash -c 'cd /opt/fuelbot/app && git checkout <commit> \
  && cd webdashboard && npm ci && npm run build && cd ../server && npm ci --omit=dev'
sudo -u fuelbot -H pm2 restart <app-name>
```

(Return with `git checkout <branch> && git pull`.)

---

## 10. Production checklist

Before a production server takes real machines:

- [ ] Its own Atlas database (`fuelbot`), ideally its own cluster; backups on
      and one test restore done.
- [ ] Atlas Network Access: only the production server's IP.
- [ ] `.env.production` with `NODE_ENV=production`, a new `JWT_SECRET`, no
      `ENV_LABEL`; `chmod 600`.
- [ ] `branch = main`; deployed commit noted.
- [ ] HTTPS with a redirect from HTTP; `COOKIE_SECURE` on (production mode).
- [ ] No seed; tenants, products and machines created in the dashboard;
      machine keys copied straight to the kiosks.
- [ ] pm2 boot service saved (`pm2 save`, `pm2 startup`), log rotation on.
- [ ] Security group: 80/443 open, 22 restricted to your IPs if possible,
      the app port closed.
- [ ] The full browser test suite (`cd webdashboard && npm run e2e`, all
      three widths) passed on the deployed commit.
- [ ] Monitoring: something polls `https://<domain>/healthz`.
- [ ] Rotate the old Razorpay key quoted in `devdocs/plans/greenfield-rewrite.md`.

**Staging and production on one server** (if unavoidable): a different
`PORT` per env file, one pm2 app each (two entries in
`ecosystem.config.cjs`), one nginx `server` block per domain, and a separate
`LOCAL_STORAGE_DIR` per env file so uploads aren't shared. A separate
production server is safer.

---

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `sudo: unknown user fuelbot` | step 1.3 wasn't run |
| `Command 'node' not found` / wrong version | step 1.2 (NodeSource, not Ubuntu's package) |
| `Killed` during apt or npm | add swap (1.1) |
| `spawn /usr/bin/node EACCES`, npm `EACCES` | run from `/tmp` (`cd /tmp`); `sudo chown -R fuelbot:fuelbot /opt/fuelbot` |
| `cd: /opt/fuelbot: Permission denied` | expected for your login; use `sudo -u fuelbot -H bash -c 'cd … && …'` |
| `Permission denied (publickey)` on clone | the deploy key isn't on this repo (step 2) |
| `scp` copied nothing | run `scp` on your Mac, `user@host:/path` (colon after the host), same user and `-i` key as `ssh` |
| `502 Bad Gateway` | app not running or on a different port than nginx's `proxy_pass` (6.4) |
| dashboard sign-in doesn't stick | HTTPS missing while `COOKIE_SECURE=true`, or `JWT_SECRET` changing (unset) between restarts |
| new setting has no effect | the env file isn't in git: add it by hand, then `pm2 restart` |
| `Dashboard not built` page | `npm run build` in `webdashboard/` (step 3.2) |
| machine shows offline | kiosk `--api` wrong, key revoked or mistyped, or the machine's clock/network; check `pm2 logs` for `401` on `/fuelbot/config` |

Logs: `sudo -u fuelbot -H pm2 logs <app-name>` (the app never logs bodies,
headers, keys or passwords); nginx: `/var/log/nginx/error.log`.
