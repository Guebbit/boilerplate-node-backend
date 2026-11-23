---
source: docker/backup/drill.sh
source_sha256: 0b213aafa92ff764aa34498acb61bb61aef16ed4d63a90500d423821864ce68d
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:28:05.187031+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/backup/drill.sh

## Purpose
End-to-end proof of the backup system using plain `docker run` (no compose, no host ports). It builds the backup image, starts a production-style replica-set Mongo, seeds it, backs it up with restic, and checks deduplication, restore, failure detection, heartbeats and scheduling. Everything runs on one private `--internal` Docker network and is cleaned up afterwards. Run it with `npm run backup:drill` (CI job `backup-drill`).

## Key elements
- **Setup variables**: `ID` (`bdrill$$`) is used as the label, network name and resource prefix. `TMP` is a temp dir holding secrets. `IMAGE` defaults to `boilerplate-backup:drill` and can be overridden with `BACKUP_DRILL_IMAGE`. `MONGO_IMAGE` and `RCLONE_IMAGE` are scraped from `compose.yaml` and `compose.backup-server.yaml`. `GATUS_IMAGE` defaults to a pinned Gatus image.
- `step`, `die`: print a heading; fail with `BACKUP DRILL FAILED: ...`.
- `cleanup` (EXIT trap): removes all containers, volumes and the network labelled `$ID`, deletes `$TMP`, and prints PASSED only if exit code is 0 and `PASS=1`. `BACKUP_DRILL_KEEP` skips the teardown.
- `run`, `volume`: `docker run` / `docker volume create` with the drill label so cleanup finds them.
- `backup_image <script> [args]`: runs one script from the backup image once, mimicking the `backup` service (user 1000, read-only, all caps dropped, secrets mounted, `/repo` and `/cache` volumes). It honours `BACKUP_REPOSITORY`, `BACKUP_HEARTBEAT_URL` and the `EXTRA` array of extra flags.
- `raw_size`: reads restic's deduplicated raw-data size from `restic stats`.
- `mongosh_root`: runs mongosh as root inside the database container over TLS.
- `throwaway`: starts a fresh no-auth Mongo with the alias `restore-drill-db`.
- `drill`: runs `backup-restore-drill` the way the `restore-drill` compose service does.
- `heartbeat_state` / `expect_heartbeat`: query Gatus's status API for the `backup` external endpoint and wait for `success` to be `true` or `false`.

## Flow (as visible)
1. Build the image from `docker/Dockerfile.backup`.
2. Generate random secrets, create the internal network and volumes.
3. Start Mongo with `docker/mongo-entrypoint.sh`, `docker/mongo-init.js` and `docker/mongo-rs-init.sh`, using keyFile and TLS, `--noscripting`, and the `backup` role.
4. Seed three collections of 4000 docs each, plus an upload and mail-spool/documents files.
5. Run backup 1, then insert 100 users and run backup 2, then backup 3 with no change. Backup 3 must add less than 1/20 of run 1's size or the drill dies.
6. Run the restore drill against a throwaway Mongo.
7. Start Gatus. A good run, with the token passed as a file, must report `success=true`. A run with `MONGO_BACKUP_USER=nobody` (token passed as a variable) must fail and report `success=false`.
8. Start a scheduler container with an every-minute schedule. The visible content cuts off here.

The header comment also lists a damaged-repository failure check and a second-machine rclone append-only server kit (backup accepted, `forget` refused, maintenance prunes).

## Relationships
This file has no graph neighbors; it is a standalone entry-point script, run directly via `npm run backup:drill` or the CI job.

## Notes
- Requires a Docker daemon, `openssl`, `sed` and `xargs`. Run it from anywhere, since it `cd`s to the repo root.
- Secret files are set to mode 0644 and the temp directories to 0755, so the non-root container user (1000) can read them.
- Uses an uncompressed archive on purpose: unchanged data must deduplicate almost completely under restic.
- Set `BACKUP_DRILL_KEEP` to keep resources for debugging. The cleanup output then prints the label and tmp path.
- The Mongo and rclone image references are parsed from the compose files with `sed`, so changes to their `image:` line format can break the extraction.
