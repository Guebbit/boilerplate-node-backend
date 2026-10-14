---
source: docker/backup/common.sh
sha256: 2f08fcaed00f4a3403dde099d6b63f76688bfba52abb0e69176610e907fd8c94
generated_at: 2026-10-14T06:47:38.904476+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/common.sh

## Purpose

Shared library sourced (never executed) by the backup scripts in this stack. It centralises the configuration knobs with their defaults, sets up the restic environment, provides a Gatus heartbeat, and supplies a small set of helpers (logging, repository bootstrap, job wrapping, Mongo config-file writing, and a mongodump/mongorestore log parser).

## Key elements

- **Configuration knobs** – `BACKUP_REPOSITORY`, `BACKUP_DATABASE`, `BACKUP_PRUNE`, `BACKUP_KEEP_HOURLY/DAILY/WEEKLY/MONTHLY`, `BACKUP_HEARTBEAT_URL`/`_TOKEN`, `BACKUP_HOST`, `BACKUP_LOCK_WAIT`. All overridable via env; empty `BACKUP_REPOSITORY` means the stack is dormant.
- **restic env exports** – `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, `RESTIC_CACHE_DIR` are exported so restic child processes inherit them.
- **`REPOSITORY_ENV_FILE`** – sources a `NAME=value` secret file (REST-server credentials, AWS keys) into the environment only when non-empty; keeps those secrets out of `docker inspect`.
- **`log()`** – prints a UTC-timestamped line to stdout (picked up by Alloy).
- **`restic_run()`** – wraps `restic` with `--retry-lock "$LOCK_WAIT"` so a briefly held repository lock doesn't abort the run.
- **`ensure_repository()`** – probes with `restic cat config`; only exit code 10 (repo missing) triggers `restic init`. Any other non-zero exit re-runs the probe to surface the real error.
- **`heartbeat <ok|fail> [reason]`** – POSTs to the Gatus external endpoint (swapping `success=true`→`success=false` on failure). Non-fatal: a delivery failure is logged, never aborts the backup.
- **`run_job <name> <fn…>`** – executes the given function as a background job then `wait`s. This keeps `set -e` active inside the body (bash disables `-e` in `if`/`||` contexts). Emits start/done/failed log lines and fires the heartbeat.
- **`write_mongo_config <dir>`** – writes a 0600 `mongo.yaml` containing the password read from `MONGO_PASSWORD_FILE`, so the secret never appears in `ps` or `/proc/*/cmdline`.
- **`count_lines`** – `sed` pipeline that extracts `namespace<TAB>documents` from `done dumping` / `finished restoring` log lines, then `sort`s.

## Relationships

No graph neighbors recorded. The file is consumed by sibling backup scripts in `docker/backup/` via `source common.sh`; it has no outgoing file-level dependencies beyond the `restic`, `curl`, `sed`, and `mongodump`/`mongorestore` binaries it invokes.

## Notes

- The file is **sourced, never executed** (shebang is for editor/tooling only).
- `set -euo pipefail` is set at the top and inherited by the sourcing script.
- The `run_job` background-subshell pattern is deliberate: calling the job body directly under `set -e` inside an `if`/`||` would silently swallow a failed `restic` step.
- `ensure_repository` treats only exit code 10 as "create me"; all other codes (bad password, unreachable server) propagate as errors.
- Heartbeat delivery failure is intentionally non-fatal—the comment notes "the silence IS the alarm."
- A `shellcheck disable=SC1090` is present for the `source` of the secret file; the file path is not statically known.
- `count_lines` handles both the singular `document` and plural `documents` in log output via an optional `s` in the regex.
