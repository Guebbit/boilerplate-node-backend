---
source: docker/ensure-deps.sh
generated_at: 2026-11-22T01:30:07.782091+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/ensure-deps.sh

## Purpose
A POSIX shell script that keeps `/app/node_modules` in sync with the lockfile at `/app/package-lock.json` for the dev compose services. Compose mounts `node_modules` as a volume that outlives the container, so dependencies added after the volume was created would otherwise be missing. This script detects a changed lockfile and reinstalls.

## Key elements
- `lock_file` (`/app/package-lock.json`): the lockfile whose hash is checked.
- `stamp_file` (`/app/node_modules/.package-lock.sha256`): stores the sha256 of the lockfile as of the last install. It lives inside `node_modules`, so it persists with the volume.
- Hash comparison: `current` is the lockfile's sha256. `recorded` is the stamp contents, or empty if the stamp is missing or unreadable.
  - If they match, the script exits 0 and does nothing.
  - If they differ or there is no stamp, it prints `ensure-deps: package-lock.json changed, running npm ci`, runs `npm ci` from `/app`, then writes the new hash to the stamp.

## Relationships
- Per its header comment, it is called by the `app`, `worker` and `cron` dev compose services.
- Per its header comment, the `dev` stage of `docker/Dockerfile` writes the same stamp after its own install, so the first container start finds a current stamp and skips the install.
- Uses `npm ci`, the same install command the dev image runs.

## Notes
- Runs with `set -eu`. If `npm ci` fails, the script exits non-zero before writing the stamp, so the next start retries.
- The stamp is written only after a successful install.
- Paths are hard-coded to `/app`, so the script is meant to run inside the container.
- `npm ci` replaces `node_modules` wholesale. The stamp is written after that step, so it is not wiped by it.
