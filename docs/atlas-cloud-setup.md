# Atlas in cloud Claude Code sessions

Cloud sessions start from a fresh container, so the Atlas plugin and its sign-in have to be
restored before every session. `scripts/atlas-cloud-setup.sh` does that from the environment's
setup script.

## One-time environment configuration

Open the cloud environment menu in the session title bar, then **Edit**.

1. **Setup script**

   ```bash
   bash scripts/atlas-cloud-setup.sh
   ```

2. **Secret `ATLAS_COOKIE`**: the value of the `_at` cookie for `atlas.unifyapps.com`.
   Sign in to Atlas in a browser, open Developer Tools, Application, Cookies,
   `atlas.unifyapps.com`, and copy the Value of `_at`. Put it under *Network secrets* if the
   environment settings offer that section, otherwise as an environment variable.

   The plugin reads `ATLAS_COOKIE` before any stored session, so no `/atlas:login` is needed.
   The cookie expires like any browser session; when Atlas tools start failing with an
   authentication error, replace the secret.

New sessions pick both up. Sessions already open do not.

## Where the plugin comes from

The public installer needs a token that expires after ten minutes, so the setup script does
not use it. It installs from the first of these that is available:

- `tools/atlas-plugin`: a committed copy of one Atlas release. Update it by unzipping a newer
  release's `payload.zip` over it. Override the location with `ATLAS_PLUGIN_SRC`.
- The `unify-apps/atlas-plugin` git marketplace, which only works when the environment's
  GitHub access includes that repository.

## Checking a session

```bash
claude plugin list --json
bash ~/.unifyapps-atlas/plugin/*/scripts/run-node.sh ~/.unifyapps-atlas/plugin/*/scripts/login.mjs --check
```

The first should list `atlas@unifyapps` as enabled at user scope. The second exits 0 when
Atlas accepts the session.
