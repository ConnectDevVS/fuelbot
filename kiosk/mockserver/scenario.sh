#!/usr/bin/env bash
# Switch the active scenario on a running mock server.
# Usage: mockserver/scenario.sh <scenario|reset> [path=/fuelbot/config] [port=${MOCK_PORT:-8787}]
set -euo pipefail
name="${1:?usage: mockserver/scenario.sh <scenario|reset> [path] [port]}"
path="${2:-/fuelbot/config}"
port="${3:-${MOCK_PORT:-8787}}"
if [[ "$name" == "reset" ]]; then
	curl -sf -X POST "http://127.0.0.1:$port/__mock/reset" | python3 -m json.tool
else
	curl -sf -X POST -H 'Content-Type: application/json' \
		-d "{\"path\": \"$path\", \"scenario\": \"$name\"}" \
		"http://127.0.0.1:$port/__mock/scenario" | python3 -m json.tool
fi
