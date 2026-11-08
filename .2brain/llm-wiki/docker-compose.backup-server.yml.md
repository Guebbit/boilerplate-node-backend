---
source: docker-compose.backup-server.yml
sha256: c840bc1ad707f2705f61601bae459bced6eac901d1b6a9b39c9f117f3e5b5448
generated_at: 2026-11-08T02:16:41.783795+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.backup-server.yml

## Purpose

Docker Compose stack for the second machine in the backup architecture: the server that receives every client's restic backups over rclone's REST API and is the sole location where old snapshots are pruned. It exists so that a compromised client (which holds its own restic password) can still write new backups but cannot delete existing history. The stack is dormant until explicitly started on a second host.

## Key elements

- **`init` service** — One-shot container that `mkdir -p` + `chown`s `/data/repos` to uid 1000. Needed because a fresh named volume is root-owned and rclone's own `/data` would otherwise clobber ownership on first mount.
- **`rest` service** — `rclone serve restic` on port 8000 with `--append-only` (refuses deletes), `--private-repos` (each user sees only its own folder), htpasswd auth, TLS ≥ 1.2. Runs as uid 1000 with a read-only root, all caps dropped, and a small tmpfs at `/tmp` for rclone's config.
- **`maintenance` service** — Runs `restic forget --prune` + `restic check` on a cron schedule (default: Sundays 04:00). Retention knobs (`BACKUP_KEEP_HOURLY/DAILY/WEEKLY/MONTHLY`) and a subset-check percentage are set via environment. Reads each client's restic password from a read-only bind of `./backup-server/clients/`.
- **`x-logging` / `x-hardening` anchors** — Shared YAML merge keys: json-file log rotation (10 MiB × 5) and a hardening profile (read-only fs, `cap_drop: ALL`, `no-new-privileges`, non-root user).
- **`secrets` block** — Maps `./backup-server/htpasswd`, `tls.crt`, `tls.key` into the `rest` container via Docker secrets at `/run/secrets/`.
- **Volumes** — `backup-data` (all client repositories) and `backup-cache` (restic pack cache for maintenance).

## Relationships

- **INSTALL.md** — The installation/setup guide that documents how to point a client's `BACKUP_REPOSITORY` at this server (`rest:https://<host>:8000/<client>/`), how to populate `./backup-server/` (htpasswd, certs, client passwords), and how to restore data from it.

## Notes

- **Dormant by default.** Nothing in a client stack references this file; it only activates when someone runs `docker compose -f docker-compose.backup-server.yml up -d` on the backup host.
- **Two disks, one purpose.** `rest` shares the `backup-data` volume with `maintenance`, but the `--append-only` flag on `rest` means writes go through while deletes are rejected. Only `maintenance` (which runs the custom `boilerplate-backup` image) can actually prune.
- **File layout is gitignored.** Everything under `./backup-server/` (htpasswd, TLS certs, per-client passwords) lives outside the image and outside git. A `.env` beside the compose file supplies `BACKUP_SERVER_*` and `BACKUP_KEEP_*` values (see `.env-example`).
- **Single published port.** `BACKUP_SERVER_BIND` (default `0.0.0.0`) and `BACKUP_SERVER_PORT` (default `8000`) control the only externally exposed endpoint.
- **Provider-neutral.** No Docker socket, no host-path mounts beyond the `./backup-server/` secrets dir; works with Podman as well.
- **`init` uses a subfolder, not the volume root**, to work around rclone's image shipping its own `/data` directory which would reset ownership of an empty volume root on first mount.
