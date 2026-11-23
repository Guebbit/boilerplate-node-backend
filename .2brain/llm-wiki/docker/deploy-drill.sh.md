---
source: docker/deploy-drill.sh
source_sha256: d0d9dd73a7f9219558ec81f4381cde591ed13139feb12582c2397da345140e64
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:29:37.517754+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/deploy-drill.sh

## Purpose
End-to-end drill of `docker/deploy.sh` against the real production compose files (`compose.yaml` + `compose.production.yaml`), using a throwaway client with generated secrets. It proves three scenarios: a good deploy, a refused broken deploy with auto-rollback, and a deploy followed by `--rollback`. Run it with `npm run deploy:drill`.

## Key elements
- **Config**: `CONTAINER_ENGINE` (default `podman`), `DEPLOY_DRILL_PORT` (default `3996`), `DEPLOY_TIMEOUT` (default `300`, exported), `DEPLOY_DRILL_KEEP` (skip cleanup). The client is `deploydrill$$` under `clients/`.
- **`cleanup` (EXIT trap)**: runs `compose down -v --remove-orphans`, force-removes leftover project containers, removes drill image tags, deletes the client dir and tmp dir. Prints `DEPLOY DRILL PASSED` only if exit code is 0 and `PASS=1`.
- **`step` / `die`**: print a heading / fail the drill with a message.
- **`deploy`**: runs `docker/deploy.sh <client> ...` and stores its exit code in `$deploy_code` without aborting.
- **`container_of`, `running_image`, `assert_running`**: locate a service's container by compose labels, and check which image `app` runs (suffix match, since local builds appear as `localhost/<name>`).
- **`assert_log_tail`**: checks the last line of `$DIR/deploys.log` is a given event for an image with a given suffix.
- **`assert_alive`**: `curl` of `/livez` on the loopback port.
- **`assert_worker_consuming` / `assert_heavy_worker_consuming`**: poll up to 15 times (2s apart) via `rabbitmqctl list_queues` in the `queue` container. They require exactly one consumer on `worker.email.send` (the `worker`) and on `worker.image.digest` (the `worker-heavy`).
- **`assert_worker_scrape`**: runs Node inside the `worker` container to check `/observability/metrics` returns 401 without the bearer token and 200 with `/run/secrets/metrics_token`.
- **`derive`**: builds a derived image from the first deployed image plus extra Dockerfile lines, and registers its tag for cleanup.
- **Main flow**:
  1. Refuse if the port is already answering, then create the client with random hex secrets (`openssl rand -hex 32`), empty optional integration secrets, and a `.env` using the `bundled` profile.
  2. Deploy 1: build and start the stack, then run the assertions. The first image is read from the last line of `deploys.log`.
  3. Check that `app`, `worker`, `worker-heavy`, `cron` and `setup` have the `*_FILE` env vars for the device-cookie and SMTP secrets and no plain secret values.
  4. Deploy 2: a derived image whose CMD exits. Expect exit 1, an `auto-rollback` log entry, and the first image running again.
  5. Deploy 3: a good derived image (`drill-second`).
  6. `--rollback`: expect a `rollback` log entry for the first image, a live API and worker, and the `setup` container unchanged.

## Relationships
No graph neighbors; the dependency graph records no interactions for this file. It is a standalone script run from the repo root, and it works under the gitignored `clients/` directory.

## Notes
- It runs from the repo root (`cd "$(dirname "$0")/.."`).
- Secret files are written with mode `0644`. The `.env` points to `smtp.invalid` and `example.com` hosts.
- Set `DEPLOY_DRILL_KEEP` to keep the client and tmp dir for debugging; the stack teardown is skipped too.
- Image tags used are `boilerplate-api:drill-broken` and `boilerplate-api:drill-second`.
