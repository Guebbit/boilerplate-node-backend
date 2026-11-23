---
source: docker/backup/common.sh
source_sha256: 561ecbb7337effabf524429518c82db393248040a5b373039b40574396c655a5
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:27:45.578891+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/backup/common.sh

## Purpose
Shared library sourced (never run) by the backup scripts. It defines the `BACKUP_*` knobs and their defaults, exports restic's environment, resolves the heartbeat token, and provides helpers for logging, restic calls, heartbeats, running jobs, mongo credentials and parsing per-collection counts. Its header points to a design document on backups, which is not identified further here.

## Key elements
- **Restic environment**: exports `RESTIC_REPOSITORY` (from `BACKUP_REPOSITORY`, empty = dormant), `RESTIC_PASSWORD_FILE` (default `/run/secrets/restic_password`) and `RESTIC_CACHE_DIR` (default `/cache`). If the secret file `restic_repository_env` is non-empty, it is sourced with `set -a`, so its `NAME=value` lines (REST user/password, AWS keys) are exported.
- **Config variables**: `BACKUP_HOST` (defaults to `COMPOSE_PROJECT_NAME`, then `stack`), `UPLOADS_DIR`, `MAIL_SPOOL_DIR`, `LOCK_WAIT` (default `10m`), and `MONGO_HOST`/`MONGO_PORT`/`MONGO_USER` (default `backup`)/`MONGO_PASSWORD_FILE`/`MONGO_CA_FILE`.
- `log` — prints a UTC-timestamped `[backup]` line to stdout (the container log).
- `secret_from_file VAR PATH` — reads a secret file into `$SECRET_FROM_FILE`. It drops exactly one trailing newline (`\n` or `\r\n`). An empty file gives an empty result. A missing or unreadable file returns 1.
- `HEARTBEAT_TOKEN` — set from `BACKUP_HEARTBEAT_TOKEN`; overridden by `BACKUP_HEARTBEAT_TOKEN_FILE` if that file is non-empty. An unreadable file exits at source time.
- `restic_run` — `restic --retry-lock "$LOCK_WAIT" "$@"`.
- `ensure_repository` — runs `restic cat config`. Only exit code 10 (repository missing) triggers `restic init`. Any other failure is logged and re-run so it fails the script.
- `heartbeat ok|fail [reason]` — POSTs with curl to `BACKUP_HEARTBEAT_URL` (an empty URL is a no-op), with an optional Bearer token. On `fail` it swaps `success=true` for `success=false` in the URL and adds an `error` parameter. A delivery failure is logged and never fatal.
- `run_job NAME CMD...` — runs the command as a background job and waits for it. It logs the duration and sends a green or red heartbeat (with name and exit code), then returns the command's exit code.
- `write_mongo_config DIR` — writes a `mongo.yaml` config file inside the given directory, containing `password: "..."` (read from `MONGO_PASSWORD_FILE`, newlines stripped) under `umask 077`, so the password stays out of `ps` and `/proc/*/cmdline`.
- `count_lines` — filters a mongodump/mongorestore log on stdin into sorted `namespace<TAB>documents` lines.

## Relationships
No graph neighbors. The header says the backup scripts source it, but none are identified here.

## Notes
- It sets `set -euo pipefail` in whichever script sources it.
- `run_job` runs the body in a background subshell on purpose: bash turns `set -e` off for functions called inside `if`/`||`, which would let a failed step go unnoticed. Anything the body changes in shell variables does not persist in the caller.
- A heartbeat failure is deliberately non-fatal ("the silence IS the alarm"), whereas an unreadable token file stops the job up front.
- `write_mongo_config` strips newlines from the password but does not escape `"` or `\` in the YAML value.
- The header notes that `BACKUP_DATABASE` and `BACKUP_PRUNE` (true/false) and `BACKUP_KEEP_*` are knobs. This file does not read them; the sourcing scripts presumably do.
