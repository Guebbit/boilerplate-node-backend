---
source: docker/backup/drill.sh
sha256: 178d230990da8abce6939d244ddd8836935007231e58e59a542717b8b5494187
generated_at: 2026-11-08T02:18:50.507406+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/drill.sh

## Purpose

A single, self-contained end-to-end proof of the entire backup pipeline. Using only `docker run` (no compose, no published ports), it spins up a production-shaped replica-set Mongo, runs real restic backups into a local repository, verifies deduplication, restores into a throwaway instance, checks the Gatus heartbeat, exercises the scheduler, tests a damaged repository, and validates the rclone append-only "second machine" kit. It leaves nothing behind and exits non-zero on any failure. Invoked via `npm run backup:drill`.

## Key elements

- **`step` / `die`** — Step-heading printer and fatal-exit helper.
- **`cleanup`** — `trap … EXIT` handler; removes all labelled containers, volumes, the network, and the temp dir. Skips removal if `BACKUP_DRILL_KEEP` is set.
- **`run`** — Wraps `docker run` so every container carries the `$ID` label for cleanup.
- **`volume`** — Creates a labelled Docker volume.
- **`backup_image`** — Runs the backup image with hardening flags (`--read-only --cap-drop ALL`, tmpfs, secret mounts) and a chosen entrypoint script (`backup-job`, `backup-restore-drill`, `bash`, …). Accepts extra flags via the global `EXTRA` array.
- **`raw_size`** — Calls `restic stats --mode raw-data --json` inside the image and extracts `total_size`.
- **`mongosh_root`** — `docker exec` into the database container with root TLS credentials to run a JS snippet.
- **`throwaway`** — Starts a one-off `mongod --noauth` on a tmpfs volume for restore-target use.
- **`drill`** — Runs the `backup-restore-drill` entrypoint against the throwaway Mongo.
- **`heartbeat_state` / `expect_heartbeat`** — Query Gatus's status API and poll until the expected `true`/`false` result appears.

**Test sequence (top-level steps):**
1. Build `boilerplate-backup:drill` from `docker/Dockerfile.backup`.
2. Create secrets, an `--internal` network, and labelled volumes.
3. Start a keyFile + TLS replica-set Mongo exactly as `docker-compose.production.yml` does (via `mongo-entrypoint.sh` and `mongo-init.js`).
4. Seed 3 × 4 000-row collections, a 2 MB upload, and a mail spool file.
5. Run `backup-job` three times (with one small mutation between runs 1 and 2) and assert restic deduplicates the unchanged run.
6. Restore into a throwaway Mongo and compare counts/files.
7. Stand up Gatus; verify the heartbeat flips green after a good run and red after a run with a wrong DB user.
8. Verify the `* * * * *` scheduler produces runs and that an empty repository stays dormant.
9. (Truncated) Damaged-repository failure and rclone append-only server tests.

## Relationships

The dependency graph reports no neighbors. The script does reference the following files at runtime (read via `sed` or volume-mounted):

- `docker-compose.production.yml` — extracts the pinned Mongo image digest.
- `docker-compose.backup-server.yml` — extracts the pinned rclone image.
- `docker/mongo-entrypoint.sh`, `docker/mongo-init.js`, `docker/mongo-rs-init.sh` — mounted into the Mongo container.
- `docker/Dockerfile.backup` — the image this drill builds and exercises.

## Notes

- **No ports, no compose.** Everything runs on a single `--internal` Docker network; the script explicitly avoids `docker compose` and `docker run -p`.
- **Image resolution is fragile by design.** The Mongo and rclone images are parsed out of the compose files with `sed` so the drill always tests the exact same pinned digest as production. If the compose format changes, extraction silently yields an empty string.
- **`EXTRA` array** is a global side-channel used to inject extra env vars (e.g. `BACKUP_HEARTBEAT_TOKEN`) into `backup_image` / `drill` calls for specific sub-tests.
- **`BACKUP_DRILL_KEEP`** (env var) prevents `cleanup` from tearing down resources, useful for debugging.
- **`BACKUP_DRILL_IMAGE`** overrides the default `boilerplate-backup:drill` tag (handy when the image is pre-built).
- The dedup assertion (`raw3 - raw2 < raw1/20`) encodes the ~5 % tolerance for restic chunk-boundary overhead on an unchanged database.
- The script is truncated in this snapshot; the damaged-repo and rclone-second-machine steps are described in the header comment but their implementation is below the truncation point.
