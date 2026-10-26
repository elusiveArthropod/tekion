#!/usr/bin/env bash
# Install the Nebula plugin for Claude Code in a cloud session container.
#
# Use it as the environment's Setup script (cloud environment menu in the
# session title bar, then Edit, then Setup script):
#   bash scripts/nebula-cloud-setup.sh
#
# Why not the install guide's one-liner: the token printed on <tenant>/guide
# dies ten minutes after it is generated, so it cannot sit in an environment
# secret that a fresh container reads hours or days later. This script takes
# the plugin from the first source that is available:
#
#   1. NEBULA_PLUGIN_SRC, or tools/nebula-plugin in this repo: an unpacked
#      copy of one release (what is inside a release's payload.zip). The
#      copy's own setup.sh installs it to $NEBULA_HOME/plugin/<version>,
#      registers that folder as the "nebula" marketplace and enables
#      nebula@nebula at user scope. Do not commit such a copy while this
#      repository is public — a release carries UnifyApps' internal skills,
#      endpoints and release keys.
#   2. NEBULA_PLUGIN_REPO, optionally NEBULA_PLUGIN_REF: a git repository
#      holding that same unpacked copy, cloned with the environment's GitHub
#      access. This is the private-repository answer to 1.
#   3. NEBULA_AUTH: an install token from <tenant>/guide. Only useful for a
#      run within ten minutes of generating it, so it is a last resort and
#      not a standing secret.
#
# Sign-in: NEBULA_COOKIE is the `_at` cookie for the release host, piped into
# the plugin's own login.mjs. The plugin then mints its own short-lived
# release tokens from that cookie, which is why the installed copy can update
# itself and why no install token belongs in a secret. The cookie expires
# like any browser session and has to be refreshed by hand.
#
# Permission rules: setup.sh writes Nebula's 55 auto-mode rules into
# ~/.claude/settings.json, but only outside a Claude session — it refuses when
# CLAUDECODE is set. A Setup script runs before the session starts, which is
# exactly where that works; the same command run from inside a session does
# not, by design.
#
# What this script cannot do: the working-tenant sign-in and the per-folder
# /nebula:setup. Both are gated on Nebula's privacy check, which needs a
# browser signed in to claude.ai. Run /nebula:setup in the session.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${NEBULA_PLUGIN_SRC:-$HERE/../tools/nebula-plugin}"
HOME_DIR="${NEBULA_HOME:-$HOME/.unifyapps-solutions}"
RELEASE_HOST="${NEBULA_RELEASE_HOST:-orbit.uat.unifyapps.com}"
INSTALLER_URL="${NEBULA_INSTALLER_URL:-https://assets.unifyapps.com/platform/nebula/install.sh}"

have() { command -v "$1" >/dev/null 2>&1; }
ok() { printf '  OK  %s\n' "$*"; }
warn() { printf '  WARN  %s\n' "$*" >&2; }
fail() { printf '  ERROR  %s\n' "$*" >&2; exit 1; }

# Newest installed copy, empty when there is none. `ls` of a missing folder is
# not an error here, so it must not end the script under `set -e`.
installed_root() {
  ls -d "$HOME_DIR"/plugin/*/ 2>/dev/null | sort -V | tail -n1 || true
}

# Run one of the plugin's own scripts through its Node runtime.
plugin_node() { # plugin_node <root> <script-relative-to-scripts> [args...]
  local root="$1" script="$2"; shift 2
  bash "$root/scripts/run-node.sh" "$root/scripts/$script" "$@"
}

echo "nebula cloud setup"

have node || fail "node is not on PATH; the cloud image is expected to ship Node 22."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || fail "Node >= 22 is required, found $(node --version)."
have claude || fail "claude is not on PATH; the cloud image is expected to ship Claude Code."
have curl || fail "curl is required."
ok "Node $(node --version)"
ok "$(claude --version)"

ROOT="$(installed_root)"
if [ -n "$ROOT" ]; then
  ok "already installed at $ROOT"
elif [ -f "$SRC/package.json" ] && [ -f "$SRC/setup.sh" ]; then
  echo "  Installing from $SRC"
  (cd -P "$SRC" && bash setup.sh </dev/null)
elif [ -n "${NEBULA_PLUGIN_REPO:-}" ]; then
  echo "  Cloning ${NEBULA_PLUGIN_REPO}"
  CLONE="$(mktemp -d)"; trap 'rm -rf "$CLONE"' EXIT
  git clone --depth 1 ${NEBULA_PLUGIN_REF:+--branch "$NEBULA_PLUGIN_REF"} \
    "$NEBULA_PLUGIN_REPO" "$CLONE/plugin" \
    || fail "could not clone $NEBULA_PLUGIN_REPO. The environment's GitHub access has to include it."
  # The copy may sit at the clone root or one folder down.
  PKG="$(find "$CLONE/plugin" -maxdepth 2 -name setup.sh -not -path '*/node_modules/*' | head -n1)"
  [ -n "$PKG" ] || fail "$NEBULA_PLUGIN_REPO has no setup.sh in its first two levels; unexpected layout."
  (cd -P "$(dirname "$PKG")" && bash setup.sh </dev/null)
elif [ -n "${NEBULA_AUTH:-}" ]; then
  warn "installing with NEBULA_AUTH; an install token expires ten minutes after it is generated, so this fails on a stale secret."
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  curl -fsSL --connect-timeout 20 --max-time 120 "$INSTALLER_URL" -o "$TMP/install.sh" \
    || fail "could not download $INSTALLER_URL."
  bash "$TMP/install.sh" --token "$NEBULA_AUTH" </dev/null \
    || fail "the installer failed. Generate a fresh token on <tenant>/guide and rerun within ten minutes."
else
  fail "No plugin source. Set one of: NEBULA_PLUGIN_SRC (or commit tools/nebula-plugin), NEBULA_PLUGIN_REPO, NEBULA_AUTH. See docs/nebula-cloud-setup.md."
fi

ROOT="$(installed_root)"
[ -n "$ROOT" ] || fail "nothing was installed under $HOME_DIR/plugin."

claude plugin list --json | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const p = JSON.parse(s).find(p => p.id === "nebula@nebula" && p.scope === "user");
    if (!p || !p.enabled) {
      console.error(`  ERROR  nebula@nebula is not installed and enabled at user scope: ${JSON.stringify(p)}`);
      process.exit(1);
    }
    console.log(`  OK  nebula@nebula ${p.version} enabled`);
  });'

if [ -z "${NEBULA_COOKIE:-}" ]; then
  warn "NEBULA_COOKIE is not set, so this copy cannot update itself and every session starts signed out. Add the _at cookie for $RELEASE_HOST as an environment secret named NEBULA_COOKIE, or sign in with /nebula:setup in each session."
  exit 0
fi

if printf '%s' "$NEBULA_COOKIE" | plugin_node "$ROOT" login.mjs "$RELEASE_HOST" --manual --for-update >/dev/null 2>&1; then
  ok "NEBULA_COOKIE accepted by $RELEASE_HOST"
else
  warn "NEBULA_COOKIE was not accepted by $RELEASE_HOST (expired?) or the host could not be reached. Updates and release reads will fail until the secret is refreshed."
  exit 0
fi

# With the release sign-in in place the copy can replace itself, so a source
# that has gone stale only has to be new enough to run this.
STATUS="$(plugin_node "$ROOT" self-update.mjs check --json 2>/dev/null || true)"
case "$STATUS" in
  *'"status":"current"'*) ok "up to date ($(basename "$(installed_root)"))" ;;
  *'"status":"available"'*|*'"status":"required"'*)
    LATEST="$(printf '%s' "$STATUS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).latestVersion??"")}catch{}})')"
    if [ -n "$LATEST" ] && plugin_node "$ROOT" self-update.mjs install "$LATEST" --json >/dev/null 2>&1; then
      ok "updated to $LATEST"
    else
      warn "an update to ${LATEST:-the latest version} is available but could not be installed; the installed copy still works."
    fi ;;
  *) warn "the update check did not answer; the installed copy still works." ;;
esac

printf '  Next, in the session: /nebula:setup (it signs in to the tenant, which needs Nebula'\''s privacy check).\n'
