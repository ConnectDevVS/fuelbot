#!/usr/bin/env bash
# Writes the settings PIN, part of the machine identity (docs/stories/settings, SET-02), as
# "<salt>:<sha256 hex of salt + pin>" in <user dir>/settings_pin.txt. Never prints the PIN.
# Like the rest of the identity, an existing file is never overwritten.
#
# Usage: tools/set_settings_pin.sh [--user-dir <dir>] [--stdin]
#   --user-dir  the app's user:// folder (default: $FUELBOT_USER_DIR)
#   --stdin     read the PIN from one line of stdin (provision.sh, the USB identity.txt)
set -euo pipefail

die() { echo "set_settings_pin: $*" >&2; exit 1; }

user_dir="${FUELBOT_USER_DIR:-}"
from_stdin=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-dir) [[ $# -ge 2 ]] || die "--user-dir needs a folder"; user_dir="$2"; shift 2 ;;
    --user-dir=*) user_dir="${1#--user-dir=}"; shift ;;
    --stdin) from_stdin=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$user_dir" ]] || die "no user folder (pass --user-dir or set FUELBOT_USER_DIR)"
[[ -d "$user_dir" ]] || die "no such folder: $user_dir"
out="$user_dir/settings_pin.txt"
[[ ! -e "$out" ]] || die "a PIN is already set; an identity is never overwritten (delete $out by hand to change it)"

if [[ $from_stdin -eq 1 ]]; then
  IFS= read -r pin || true
else
  read -rs -p "Settings PIN (6 digits): " pin; echo >&2
  read -rs -p "Again: " again; echo >&2
  [[ "$pin" == "$again" ]] || die "the two PINs don't match"
fi
[[ "$pin" =~ ^[0-9]{6}$ ]] || die "the PIN must be exactly 6 digits"

if command -v sha256sum >/dev/null; then sha() { sha256sum; }; else sha() { shasum -a 256; }; fi
salt="$(openssl rand -hex 16)"
hash="$(printf '%s%s' "$salt" "$pin" | sha | cut -d' ' -f1)"
unset pin again

umask 077
printf '%s:%s\n' "$salt" "$hash" > "$out.tmp"
mv "$out.tmp" "$out"
echo "set_settings_pin: wrote $out"
