#!/usr/bin/env bash
# curl wrapper for UnifyApps platform APIs using the user's session cookie.
# Usage:
#   ua_api.sh <base-url> <cookie-file> GET  /api/entity/<type>/<id>
#   ua_api.sh <base-url> <cookie-file> POST /api/entity/<type> '{"filter":...}'
#   ua_api.sh <base-url> <cookie-file> POST /api/entity '{"entityType":"dataset","properties":{...}}'
# Prints the response body to stdout. Prints "HTTP <code>" to stderr.
# Exit: 0 on 2xx, 2 on 401/403/redirect-to-login (cookie expired), 1 otherwise.
set -u
base="${1%/}"; cookie_file="$2"; method="$3"; path="$4"; body="${5:-}"
cookie=$(tr -d '\r\n' < "$cookie_file" | sed -E 's/^Cookie:[[:space:]]*//I')
tmp=$(mktemp)
code=$(curl -sS -m 60 -o "$tmp" -w '%{http_code}' -X "$method" "$base$path" \
  -H "Cookie: $cookie" -H 'content-type: application/json' -H 'accept: application/json' \
  ${body:+--data-raw "$body"})
echo "HTTP $code" >&2
cat "$tmp"; echo
rm -f "$tmp"
case "$code" in
  2*) exit 0 ;;
  401|403|302|307) exit 2 ;;
  *) exit 1 ;;
esac
