---
source: docker/deploy-drill.sh
sha256: 0c0994b2dd2245f88279d0391aabc6e03c1d04872d6921933101a1af182b175c
generated_at: 2026-11-08T02:20:00.567532+00:00
model: ollama:qwen3.8:27b
---

# docker/deploy-drill.sh

## Purpose

End-to-end verification of `docker/deploy.sh` against the real production compose file. Spins up a throwaway client with generated secrets, then exercises four scenarios: a successful deploy, auto-rollback of a broken image, a second good deploy, and an explicit `--rollback`. All artifacts are torn down on exit regardless of outcome.

## Key elements

- **`cleanup()`** — `EXIT` trap; tears down the compose stack, removes drill images, and deletes the client/tmp directories. Skipped if `DEPLOY_DRILL_KEEP` is set. Prints final PASS/FAIL verdict.
- **`deploy()`** — invokes `docker/deploy.sh <client> [args]`, capturing the exit code in `$deploy_code` without tripping `set -e`.
- **`container_of` / `running_image`** — look up a service's container by compose-project label and read its image.
- **`assert_running` / `assert_log_tail` / `assert_alive`** — the three assertion helpers: image suffix check, `deploys.log` last-line check, and `curl /livez` health check on the published loopback port.
- **`derive()`** — builds a one-off image (`FROM <first-image>` + extra Dockerfile lines) and tracks it in `DRILL_TAGS` for cleanup.
- **`step()` / `die()`** — heading printer and fatal-exit helper.
- **Main body (4 steps)** — creates the client env, then runs the four deploy scenarios in order, asserting after each.

## Relationships

- **`docker/deploy.sh`** — the script under test; called four times (default deploy, broken-image deploy, second-good deploy, `--rollback`).
- **`docker-compose.production.yml`** — the production compose file used by both the drill stack and `deploy.sh`.
- **`docs/tools/deploy-and-rollback.md`** — referenced in the header comment for operator-facing documentation of the drill.

## Notes

- Default container engine is **podman** (`CONTAINER_ENGINE` env var), even though the script lives under `docker/`.
- Default port is **3996** (`DEPLOY_DRILL_PORT`); the script dies immediately if that port is already answering `/livez`.
- Client secrets live under `clients/deploydrill<PID>/` (gitignored); 14+ keys are generated with `openssl rand -hex 32`.
- `PASS` is a plain counter (0 → 1) used only to decide the final message in `cleanup`; it is not a true pass/fail bit—any `die` still exits non-zero.
- The `--rollback` step also asserts the `setup` one-shot container is **not** recreated, guarding against a regression where rollback re-runs migrations.
- Invoke via `npm run deploy:drill` rather than running the script directly (sets up the `npm` environment).
