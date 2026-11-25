#!/usr/bin/env bash
set -u
base="${1%/}"; tok_file="$2"; method="$3"; path="$4"; body="${5:-}"
tok=$(tr -d '\r\n' < "$tok_file")
tmp=$(mktemp)
code=$(curl -sS -m 60 -o "$tmp" -w '%{http_code}' -X "$method" "$base$path" \
  -H "x-ua-at: $tok" -H 'content-type: application/json' -H 'accept: application/json' \
  ${body:+--data-raw "$body"})
echo "HTTP $code" >&2
cat "$tmp"; echo; rm -f "$tmp"
case "$code" in 2*) exit 0;; 401|403|302|307) exit 2;; *) exit 1;; esac
