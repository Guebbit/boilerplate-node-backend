---
source: docker/observability/alertmanager-render.sh
sha256: d769379ddbcc90620cde9ce8290a239156db905e20099513be1951b30920a6d9
generated_at: 2026-11-08T02:21:03.881452+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/alertmanager-render.sh

## Purpose

Renders the Alertmanager YAML configuration from `alertmanager.config.template.yaml` using only POSIX `sh` and `sed` (the image is busybox, so no `envsubst` or `bash`). It conditionally includes receiver sections based on which environment variables are set, extracts secrets into permission-restricted files, and optionally `exec`s Alertmanager as the container entrypoint.

## Key elements

- **`escape()`** — Escapes `\`, `/`, `&` (sed metacharacters) and `'` (YAML single-quote) so a value can be safely injected into a `sed` replacement string.
- **`write_secret()`** — Writes a secret value to `$secrets/<name>` with `umask 077`, keeping it out of the rendered config and the process command line.
- **Receiver-group logic** — Derives `email`, `hook`, `beat` flags from the presence of their required env vars. Sets `default`, `failing`, `watchdog`, and `critical` receiver names accordingly (falling back to `null`).
- **Conditional section removal** — Builds a list of `sed -e` expressions that delete `# BEGIN <group> … # END <group>` blocks for any disabled receiver. A no-op expression is always first to avoid a bare `sed`.
- **Placeholder substitution** — A second `sed` pass strips remaining `# BEGIN/END` marker lines and replaces `@RECEIVER_*@`, `@ALERT_*@`, and `@SECRETS_DIR@` tokens with their values.
- **Optional `exec "$@"`** — If arguments remain after the first three, the script hands the process to Alertmanager (typical container entrypoint usage).

## Relationships

- **`docker/observability/alertmanager.config.template.yaml`** — The input template. This script reads it from `$1`, applies conditional deletions and placeholder substitutions, and writes the result to `$2`. The template must contain `# BEGIN <group> … # END <group>` markers and `@PLACEHOLDER@` tokens matching the names used here.

## Notes

- **Secrets are never written into the config.** URLs, tokens, and the SMTP password go to `0600` files under `<secrets-dir>` (referenced in the config via `@SECRETS_DIR@`), so they do not appear in `/api/v2/status` or `ps` output.
- **`ALERT_SMTP_REQUIRE_TLS`** defaults to `true`; set it to `false` for plain-SMTP sinks like Mailpit.
- **`eval` usage** is confined to expanding a fixed list of `-e` expressions built from the group flags; it never interpolates user-supplied values.
- **`ALERT_EMAIL_FROM`** falls back to `NODE_SMTP_USER` if unset.
- **`NODE_SMTP_PORT`** defaults to `587` if unset.
- The script is deliberately POSIX `sh`; it will not work under assumptions that require `bash`-isms.
