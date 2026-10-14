---
source: docker/observability/alertmanager-render.sh
sha256: d769379ddbcc90620cde9ce8290a239156db905e20099513be1951b30920a6d9
generated_at: 2026-10-14T06:50:05.044072+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/alertmanager-render.sh

## Purpose

Renders `alertmanager.config.template.yaml` into a final `alertmanager.yml` by substituting environment variables and stripping inactive receiver groups, then optionally `exec`s Alertmanager as the container's main process. Written in POSIX sh (busybox, no bash, no `envsubst`) so it runs inside the Alertmanager container image itself.

## Key elements

- **`escape`** – Escapes a value for safe embedding in a single-quoted YAML scalar *inside* a `sed` substitution (handles `\`, `/`, `&` for sed and `'` for YAML).
- **`write_secret`** – Writes a secret value to a `0600` file under the secrets directory (via subshell + `umask 077`), keeping passwords, URLs, and tokens out of the rendered config and the container's visible command line.
- **Group-activation logic** – Reads env vars (`ALERT_EMAIL_TO`, `ALERT_WEBHOOK_URL`, `ALERT_HEARTBEAT_URL`, etc.) and sets `email`, `hook`, `beat` flags. Determines which receiver name each route (`default`, `failing`, `watchdog`, `critical`) should point at; falls back to `null` when a group is off.
- **`drop` sed-expression list** – Builds a list of `sed -e '/# BEGIN x$/,/# END x$/d'` commands for every inactive group (and sub-groups like `smtp-auth`, `heartbeat-auth`). Pre-seeded with a no-op (`s/^//`) so the list is never empty. Applied via `eval` on the fixed list only.
- **Main `sed` pipeline** – After group removal, a second `sed` pass strips `# BEGIN/END` markers and substitutes all `@PLACEHOLDER@` tokens with the escaped env values.
- **Optional `exec "$@"`** – If extra arguments were passed (i.e., Alertmanager binary + flags), the script hands the process over, making it usable as the container entrypoint.

## Relationships

No graph neighbors are recorded for this file.

## Notes

- **No bash, no `envsubst`** – The image is busybox; all substitution is done with `sed`. The `escape` function exists precisely because the template uses single-quoted YAML scalars.
- **`eval` is safe here only** because it expands a *fixed* list of `sed -e` flags built from a known set of group names, never a user-supplied value. Do not pass untrusted strings into the `drop` variable.
- **Secrets are files, not config lines.** `ALERT_WEBHOOK_URL`, `ALERT_HEARTBEAT_URL`, `ALERT_HEARTBEAT_TOKEN`, and `NODE_SMTP_PASS` are written to individual `0600` files in `<secrets-dir>`; the rendered config references them via `file:` directives (or equivalent), keeping them out of `/api/v2/status` output.
- **`ALERT_SMTP_REQUIRE_TLS`** defaults to `true`. Set it to `false` when using a local sink like Mailpit over plain SMTP.
- **Usage contract:** `alertmanager-render.sh <template> <out-config> <secrets-dir> [alertmanager args...]`. The first three positional args are consumed; everything after becomes the `exec` target.
- See `docs/tools/prometheus.md#alert-routing` for the broader routing design this script implements.
