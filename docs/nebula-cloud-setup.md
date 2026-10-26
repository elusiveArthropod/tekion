# Nebula in cloud Claude Code sessions

Cloud sessions start from a fresh container, so the Nebula plugin and its sign-in have to be
restored before every session. `scripts/nebula-cloud-setup.sh` does that from the environment's
setup script.

## One-time environment configuration

Open the cloud environment menu in the session title bar, then **Edit**.

1. **Setup script**

   ```bash
   bash scripts/nebula-cloud-setup.sh
   ```

2. **Secret `NEBULA_COOKIE`**: the value of the `_at` cookie for `orbit.uat.unifyapps.com`.
   Sign in to the tenant in a browser, open Developer Tools, Application, Cookies, and copy the
   Value of `_at`. Put it under *Network secrets* if the environment settings offer that
   section, otherwise as an environment variable.

   The script pipes it into the plugin's own `login.mjs`, which saves it to
   `~/.unifyapps-solutions/session/cookies/<host>`. From there Nebula mints its own
   short-lived release tokens, so the installed copy can update itself. The cookie expires like
   any browser session; when release reads start failing, replace the secret.

3. **A plugin source**, below.

New sessions pick all three up. Sessions already open do not.

## Where the plugin comes from

The install guide's one-liner carries a token that dies ten minutes after it is generated, so
it cannot sit in a secret that a container reads hours later — an environment that keeps the
token in `NEBULA_AUTH` works once and then fails with `token rejected (HTTP 401)`. The script
installs from the first of these that is available instead:

- `tools/nebula-plugin`: an unpacked copy of one release — the contents of a release's
  `payload.zip`. Update it by unzipping a newer release over it. Override the location with
  `NEBULA_PLUGIN_SRC`.

  **Do not commit that copy while this repository is public.** A release carries UnifyApps'
  internal skills, service endpoints and release keys. Either make the repository private
  first, or use the git source below.

- `NEBULA_PLUGIN_REPO`, optionally `NEBULA_PLUGIN_REF`: a **private** git repository holding
  the same unpacked copy. It only works when the environment's GitHub access includes that
  repository.

- `NEBULA_AUTH`: an install token from `<tenant>/guide`, as a last resort for a one-off run
  within ten minutes of generating it.

A source only has to be new enough to run `self-update.mjs`. Once the release sign-in is in
place the script updates the copy to the latest version, so a vendored copy going stale is not
a problem by itself.

## What does not survive a new session

The plugin, the auto-mode permission rules and the release sign-in do. Two things do not:

- **The tenant sign-in**, because it is gated on Nebula's privacy check, which needs a browser
  signed in to claude.ai and holds for one day. `/nebula:setup` in the session does it.
- **Per-folder setup.** `/nebula:setup` runs once per folder and writes the solution guide into
  that folder's `CLAUDE.md`.

Nebula's usage tracking covers every Claude session once installed, including folders that
have nothing to do with Nebula. Set `NEBULA_USAGE_TRACKING=0` as an environment variable to
turn it off.

## Permission rules

`setup.sh` writes Nebula's 55 auto-mode rules (17 `allow`, 38 `ask`) into
`~/.claude/settings.json`, but it refuses to when `CLAUDECODE` is set, because a session that
edits its own permissions is no safeguard at all. A setup script runs before the session
starts, so it is the one place this works unattended. Inside a session the same command prints
the terminal command to run by hand instead.

## Checking a session

```bash
claude plugin list --json
bash ~/.unifyapps-solutions/plugin/*/scripts/run-node.sh \
  ~/.unifyapps-solutions/plugin/*/scripts/self-update.mjs check --json
```

The first should list `nebula@nebula` as enabled at user scope. The second answers
`{"status":"current",...}` when the release sign-in works, and `"signedOut":true` when
`NEBULA_COOKIE` is missing or expired.
