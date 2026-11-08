---
source: docker/backup/common.sh
sha256: 2f08fcaed00f4a3403dde099d6b63f76688bfba52abb0e69176610e907fd8c94
generated_at: 2026-11-08T02:18:31.785006+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/common.sh

## Purpose

Shared library sourced (never executed) by the per-stack backup scripts. Centralises restic environment setup, repository bootstrap, a Gatus heartbeat, a job wrapper that preserves `set -e`, and a small parser for mongodump/mongorestore output. Design rationale lives in `docs/tools/backups.md`.

## Key elements

- **Environment setup** — Exports `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, `RESTIC_CACHE_DIR` and sources optional `NAME=value` credential lines from a secret file (`/run/secrets/restic_repository_env` by default). Sets defaults for `BACKUP_HOST`, `UPLOADS_DIR`, `MAIL_SPOOL_DIR`, `LOCK_WAIT`, and MongoDB connection variables.
- **`log()`** — Prints a UTC-timestamped `[backup]` line to stdout (collected by Alloy).
- **`restic_run()`** — Thin wrapper: `restic --retry-lock "$LOCK_WAIT" "$@"`.
- **`ensure_repository()`** — Runs `restic cat config`; if exit code is exactly **10** (repo doesn't exist) calls `restic init`. Any other non-zero code is re-raised so auth/network failures still abort.
- **`heartbeat <ok|fail> [reason]`** — POSTs to `BACKUP_HEARTBEAT_URL` (Gatus external endpoint). Swaps `success=true` → `success=false` and appends `error=` on failure. Supports a Bearer token. Delivery failure is logged, never fatal.
- **`run_job <name> <fn…>`** — Runs the given function in a **background subshell** (so `set -e` stays active despite the `if`-context pitfall), `wait`s, times it, calls `heartbeat`, and returns the child's exit code.
- **`write_mongo_config <dir>`** — Writes a 0600 `mongo.yaml` (password from `MONGO_PASSWORD_FILE`) into a private temp dir for `mongodump`/`mongorestore --config`, keeping the password out of `ps`/`/proc`.
- **`count_lines()`** — `sed` filter that turns `done dumping …` / `finished restoring …` log lines into `namespace<TAB>doc_count` pairs.

## Relationships

No graph neighbors are recorded for this file. It is consumed via `source` by the sibling backup scripts in `docker/backup/` and references the design doc `docs/tools/backups.md`.

## Notes

- **Sourced, not executed** — the `#!/usr/bin/env bash` shebang and `set -euo pipefail` mean the caller inherits strict mode; be aware that `set -a` / `set +a` around the credential source is scoped to that block.
- **`run_job` background-subshell trick** — bash silently disables `set -e` for a function called inside `if … || …`. The `"$@" &` + `wait $!` pattern is the deliberate workaround; don't "simplify" it away.
- **`ensure_repository` exit-code contract** — only restic exit code **10** triggers `init`. Codes 1 (bad password) or 2 (unreachable server) are intentionally left as hard failures.
- **`BACKUP_REPOSITORY` empty = dormant** — every script that sources this file must gate its actual work on this variable being non-empty; the library itself does not.
- **`BACKUP_HOST` default** falls back to `COMPOSE_PROJECT_NAME`, then the literal string `stack`. This value is the `restic --host` label that prevents two stacks sharing one repository from pruning each other's snapshots.
