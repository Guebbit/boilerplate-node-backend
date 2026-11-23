---
source: docker/observability/alertmanager-render.sh
source_sha256: 85a63e988b285e98c1e380bdd66ada6e21eabb41d0d6797db202341f091a948e
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:31:11.428091+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/alertmanager-render.sh

## Purpose
A POSIX `sh` script (busybox-compatible: no `envsubst`, no bash) that renders an Alertmanager config from a template using environment variables. It writes secrets to separate files, then optionally `exec`s Alertmanager on the rendered config. It exists so one template can serve both production (secrets as files) and dev (secrets as variables), with unused features stripped out. The script's own header points to `docs/operate/deployment-hardening.md#alert-routing` for the rationale.

## Key elements
- **Usage:** `alertmanager-render.sh <template> <out-config> <secrets-dir> [alertmanager args...]`. If extra arguments are given, the script ends with `exec "$@"`.
- **`escape`:** makes a value safe as a sed replacement inside a single-quoted YAML scalar. It escapes `\`, `/` and `&` for sed, and doubles `'` for YAML.
- **`write_secret`:** writes a value to `<secrets-dir>/<name>` under `umask 077`, so the file is readable only by the owner.
- **`read_secret`:** resolves a secret into the global `$secret`.
  - A non-empty `_FILE` variable wins over the plain variable.
  - It drops exactly one trailing newline (`\n` or `\r\n`). It uses an `x` sentinel to get around `$(...)` stripping newlines.
  - An empty file counts as unset, so the plain variable is used.
  - A named file that is missing or unreadable exits 1. This is deliberate, so Alertmanager never starts without a credential.
  - Its comments say it follows the same rule as `secret-files.ts`.
- **Group toggles:**
  - `email` needs `ALERT_EMAIL_TO`, the from address and `NODE_SMTP_HOST`. The from address is `ALERT_EMAIL_FROM`, defaulting to `NODE_SMTP_USER`.
  - `hook` needs the webhook URL.
  - `beat` needs `ALERT_HEARTBEAT_URL`.
- **Receiver selection:** `default`, `failing`, `watchdog` and `critical` each resolve to a real receiver or to `null`.
  - `default` is `email` or `null`.
  - `failing` is `webhook` or `null`.
  - `watchdog` is `heartbeat` or `null`.
  - `critical` is `email-and-webhook`, `email`, `webhook` or `null`.
- **Secret files:** `smtp-password`, `webhook-url`, `heartbeat-url` and `heartbeat-token`. The secrets dir is created with mode 700.
- **Template rendering:** builds a list of sed `-e` range deletions for `# BEGIN x` / `# END x` blocks.
  - The block names are `email`, `smtp-auth`, `webhook`, `heartbeat` and `heartbeat-auth`.
  - A second `sed` removes the remaining markers and substitutes the `@PLACEHOLDER@` tokens, plus the `require_tls: ALERT_SMTP_REQUIRE_TLS` line.
  - Output goes to `<out-config>`.

## Relationships
No graph neighbors. The script is self-contained and has no recorded dependencies on other files in the dependency graph. It takes the template path as its first argument at run time.

## Notes
- Heartbeat URL and token, webhook URL and SMTP password are kept out of the config. They go in 0600 files under the secrets dir, so they don't show in `/api/v2/status` or the container command line. The config only gets `@SECRETS_DIR@`.
- `ALERT_SMTP_REQUIRE_TLS` defaults to `true`. A plain-SMTP sink such as mailpit needs `false`. `NODE_SMTP_PORT` defaults to `587`.
- `eval` is used only on the fixed `-e` expression list built from internal flags, never on knob values. Values are interpolated into the sed script only after `escape`.
- The `drop` list starts with a no-op `-e 's/^//'` so `sed` is never called with no script.
- `ALERT_HEARTBEAT_URL` has no `_FILE` form, although it is written to a secret file. Only `NODE_SMTP_PASS`, `ALERT_WEBHOOK_URL` and `ALERT_HEARTBEAT_TOKEN` do.
- The script runs under `set -eu`, so the three positional arguments are required.
