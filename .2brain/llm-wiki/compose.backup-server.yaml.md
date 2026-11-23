---
source: compose.backup-server.yaml
source_sha256: fa76d8a1c3823c6d5c3a8a218d0c8cd739bc2bb23057cb5718d195e78c9a848b
context_sha256: 663459b9c337cdf4abbe826262c66e4c9a34f617bf210808e0618889311e8f4f
generated_at: 2026-11-22T01:25:53.592328+00:00
model: claude-code:claude-sonnet-5-5
---

# compose.backup-server.yaml

## Purpose
Compose stack for the second machine that stores every client's restic backups. It serves them through an append-only endpoint (so a compromised client cannot delete history) and runs the only job allowed to delete: a scheduled forget/prune/check on the same disk. It is dormant until started on a separate host and a client sets `BACKUP_REPOSITORY=rest:https://<host>:8000/<client>/`.

## Key elements
- **`init`**: one-shot root container (`CHOWN` cap only). Creates `/data/repos` on the `backup-data` volume and chowns it to uid 1000. It uses a subfolder because an image's own `/data` can reset the volume root's ownership.
- **`rest`**: the pinned `rclone/rclone` image (by digest) running `serve restic /data/repos` with these flags:
  - `--append-only`
  - `--private-repos` (each user reaches only the folder named like itself)
  - `--htpasswd`, `--cert` and `--key` from Compose secrets
  - `--min-tls-version=tls1.2`
  - It publishes `${BACKUP_SERVER_BIND:-0.0.0.0}:${BACKUP_SERVER_PORT:-8000}:8000`.
- **`maintenance`**: runs the `${BACKUP_IMAGE:-boilerplate-backup:latest}` image with `BACKUP_SERVER_MODE=true`.
  - The schedule defaults to `0 4 * * 0`.
  - Retention comes from `BACKUP_KEEP_HOURLY`, `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` and `BACKUP_KEEP_MONTHLY`.
  - `BACKUP_CHECK_SUBSET` sets the share of data checked (default 5%).
  - Optional `BACKUP_HEARTBEAT_URL` and `BACKUP_HEARTBEAT_TOKEN` report to a second Gatus endpoint.
  - It mounts `./backup-server/clients` read-only (per-client restic passwords) and a `backup-cache` volume.
  - Its healthcheck curls `http://127.0.0.1:9746/health`.
- **`x-logging` / `x-hardening` anchors**: shared log rotation (10m x 5, driver from `CONTAINER_LOG_DRIVER`) and hardening (read-only root, `cap_drop: ALL`, `no-new-privileges`, user `1000:1000`).
- **Secrets**: `htpasswd`, `tls_cert` and `tls_key`, read from `./backup-server/`.
- **Volumes**: `backup-data` (all client repositories, the volume to size and back up) and `backup-cache`.

## Relationships
- `INSTALL.md` is a graph neighbor, but this file does not reference it directly.
- `compose.production.yaml` is a client-side stack. Per this file's header, nothing there points here until a client sets `BACKUP_REPOSITORY` to this server's `rest:` URL.

## Notes
- Run it from its own directory with its own `.env`; `.env-example` has the `BACKUP_SERVER_*` and `BACKUP_KEEP_*` block: `docker compose -f compose.backup-server.yaml up -d`.
- Everything under `./backup-server/` (`htpasswd` with bcrypt hashes, `tls.crt`, `tls.key`, `clients/<name>/password`) is gitignored and never baked into an image.
- `rest` and `maintenance` both start only after `init` completes successfully.
- The `maintenance` healthcheck is declared in Compose because Podman builds OCI images by default, and OCI drops an image's own `HEALTHCHECK`.
- No Docker socket is mounted, and the only host path used is `./backup-server/clients` (plus the secret files above).
