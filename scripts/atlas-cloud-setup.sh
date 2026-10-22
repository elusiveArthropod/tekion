#!/usr/bin/env bash
# Install the Atlas plugin for Claude Code in a cloud session container.
#
# Use it as the environment's Setup script (cloud environment menu in the
# session title bar, then Edit, then Setup script):
#   bash scripts/atlas-cloud-setup.sh
#
# Why not the public installer: install-v1.sh needs a token from the Atlas
# install page that expires after ten minutes, which no setup script can
# carry. This script takes the plugin from one of two places instead:
#
#   1. tools/atlas-plugin in this repo (a committed copy of a release), or
#      any folder named by ATLAS_PLUGIN_SRC. The plugin's own install-local.mjs
#      copies it to ~/.unifyapps-atlas/plugin/<version>, registers that folder
#      as the "unifyapps" marketplace and installs atlas@unifyapps at user
#      scope. Rerunning is safe.
#   2. Otherwise the git marketplace unify-apps/atlas-plugin, which needs the
#      environment's GitHub access to include that repository.
#
# Sign-in: the plugin reads the ATLAS_COOKIE environment variable before any
# stored session, so add the `_at` cookie from atlas.unifyapps.com as an
# environment secret named ATLAS_COOKIE. No /atlas:login is needed then. The
# cookie expires like any browser session and has to be refreshed by hand.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${ATLAS_PLUGIN_SRC:-$HERE/../tools/atlas-plugin}"

have() { command -v "$1" >/dev/null 2>&1; }
ok() { printf '  OK  %s\n' "$*"; }
warn() { printf '  WARN  %s\n' "$*" >&2; }
fail() { printf '  ERROR  %s\n' "$*" >&2; exit 1; }

echo "atlas cloud setup"
have node || fail "node is not on PATH; the cloud image is expected to ship Node 22."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || fail "Node >= 22 is required, found $(node --version)."
have claude || fail "claude is not on PATH; the cloud image is expected to ship Claude Code."
ok "Node $(node --version)"
ok "$(claude --version)"

if [ -f "$SRC/package.json" ] && [ -f "$SRC/scripts/install-local.mjs" ]; then
  echo "  Installing from $SRC"
  node "$SRC/scripts/install-local.mjs"
else
  echo "  No vendored plugin at $SRC; installing from the unify-apps/atlas-plugin marketplace"
  if ! claude plugin marketplace list --json | grep -q '"name": *"unifyapps"'; then
    claude plugin marketplace add unify-apps/atlas-plugin
  fi
  claude plugin install atlas@unifyapps --scope user
fi

claude plugin list --json | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const p = JSON.parse(s).find(p => p.id === "atlas@unifyapps" && p.scope === "user");
    if (!p || !p.enabled) {
      console.error(`  ERROR  atlas@unifyapps is not installed and enabled at user scope: ${JSON.stringify(p)}`);
      process.exit(1);
    }
    console.log(`  OK  atlas@unifyapps ${p.version} enabled`);
  });'

if [ -z "${ATLAS_COOKIE:-}" ]; then
  warn "ATLAS_COOKIE is not set. Add the _at cookie from atlas.unifyapps.com as an environment secret named ATLAS_COOKIE, or run /atlas:login in each session."
  exit 0
fi

ROOT="$(ls -d "${ATLAS_HOME:-$HOME/.unifyapps-atlas}"/plugin/*/ 2>/dev/null | sort -V | tail -n1)"
if [ -n "$ROOT" ] && bash "$ROOT/scripts/run-node.sh" "$ROOT/scripts/login.mjs" --check --quiet >/dev/null 2>&1; then
  ok "ATLAS_COOKIE accepted by atlas.unifyapps.com"
else
  warn "ATLAS_COOKIE is set but atlas.unifyapps.com did not accept it (expired?) or could not be reached. Atlas tools will fail until the secret is refreshed."
fi
