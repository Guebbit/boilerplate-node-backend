---
source: docker/backup/drill.sh
sha256: 3f8ce509babdd4c631aadfc7e22e953afadc3212349be5a75e9d0d8c4f17d373
generated_at: 2026-10-14T06:48:08.034633+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/drill.sh

## Purpose

End-to-end integration drill that proves the backup system works as a whole: it spins up a production-shaped replica-set MongoDB on a private `--internal` Docker network, seeds data, runs the backup image's `backup-job` and `backup-restore-drill` scripts, verifies restic deduplication across three runs, restores into a throwaway Mongo and compares row counts, exercises the Gatus heartbeat (green on success, red on failure), and tests the cron scheduler (active and dormant). It is the single command (`npm run backup:drill`) that CI runs to confirm nothing in the backup pipeline is broken.

## Key elements

- **`set -euo pipefail` + `trap cleanup EXIT`** — any failure aborts immediately; `cleanup` removes all labelled containers, volumes, the network, and the temp dir.
- **`ID` / `NET` / `TMP`** — per-run identifier (`bdrill$$`), an `--internal` Docker network, and a `mktemp -d` directory for generated secrets and Gatus config. Everything is labelled `$ID` so cleanup is surgical.
- **`backup_image <script> [args…]`** — the central helper: `docker run` the backup image with the same flags the `backup` compose service uses (`--user 1000:1000 --read-only --cap-drop ALL`, read-only secrets, `$ID-repo`, `$ID-cache`, etc.). Accepts extra flags via the `EXTRA` array.
- **`drill`** — runs `backup-restore-drill` inside a throwaway `--noauth` Mongo (`$ID-throwaway`), mirroring the `restore-drill` compose service.
- **`raw_size`** — extracts `total_size` from `restic stats --mode raw-data --json` to measure deduplication.
- **`mongosh_root`** — `docker exec mongosh` with TLS against the database container, used for seeding and the "small change" between backup runs.
- **`heartbeat_state` / `expect_heartbeat`** — poll the Gatus JSON API (via `curl` + `jq` in the backup image) to assert the `backup` external endpoint flipped to the expected `true`/`false` result.
- **`throwaway`** — starts a clean, auth-less single-node Mongo on a tmpfs volume for restore verification.
- **`step` / `die`** — section headers and a uniform failure exit path.
- **Image pinning via `sed`** — `MONGO_IMAGE` and `RCLONE_IMAGE` are extracted from `docker-compose.production.yml` / `docker-compose.backup-server.yml` at runtime so the drill always uses the same pinned digests as production.
- **Scheduler step** — starts a long-lived container with `BACKUP_SCHEDULE='* * * * *'` and a second "dormant" container (empty repo) to verify cron fires runs and stays idle when there is nothing to back up.

## Relationships

No graph-tracked neighbors are listed. The script references, at runtime:

- `docker-compose.production.yml` and `docker-compose.backup-server.yml` (reads pinned image digests via `sed`)
- `docker/Dockerfile.backup` (builds the backup image)
- `docker/mongo-entrypoint.sh`, `docker/mongo-init.js`, `docker/mongo-rs-init.sh` (mounted into the Mongo container)
- `docs/tools/backups.md#the-restore-drill` (documented entry point)

## Notes

- **Nothing is published.** The network is `--internal`; all inter-container traffic is via DNS aliases on that private network. The drill leaves zero published ports and (on success) zero containers/volumes behind.
- **`BACKUP_DRILL_KEEP=1`** (env var) skips cleanup so you can inspect the running stack after a failure.
- **Dedup assertion is percentage-based**: run 3 (no data change) must add less than 5 % of run 1's raw size. A larger delta means restic is not deduplicating and the drill fails.
- **Gatus heartbeat uses an `external-endpoints` config with a 10 m interval**; the drill overrides `BACKUP_HEARTBEAT_URL` and `EXTRA` per-scenario, then resets them.
- **The file is truncated in the repo snapshot provided**; steps 5–6 from the header (damaged-repository failure and the rclone second-machine kit) are described in the comment block but their implementation lies past the visible cut.
- **Temp-dir permissions are `0755`** (not `0700`) because the backup image runs as UID 1000, not root, and must read the secrets mounted from `$TMP`.
- **`EXTRA` is an array**, not a string, so it can carry multiple `-e` flags without word-splitting issues under `set -u`.
