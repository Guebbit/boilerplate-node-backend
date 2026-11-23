---
source: compose.yaml
generated_at: 2026-11-22T01:26:50.414967+00:00
model: claude-code:claude-sonnet-5-5
---

# compose.yaml

## Purpose
The shared base of the Docker/Podman Compose stacks. It declares the service names, how `app` is built, and the image pins that are identical in development and production. It is never run on its own: it is always combined with an overlay file.

## Key elements
- `app`: the API. Built from context `.` with `docker/Dockerfile`. Each overlay chooses its own `build.target` stage.
- `database`: MongoDB `mongo:9.0.4`, pinned by digest.
- `cache` and `limits`: two Redis instances (the response cache and the rate-limit store). Both use the same digest-pinned `redis:8-alpine` image.
- `queue`: an empty stub (`{}`) for RabbitMQ. Its image is set per overlay, because development adds the management UI.
- `prometheus`, `alertmanager`, `loki`, `alloy`: the monitoring stack, each digest-pinned. Both stacks run these same images.

## Relationships
- `compose.override.yaml`: the development overlay. A plain `docker compose up` auto-loads it beside this file. It sets profiles (the monitoring services go under `observability`), ports, environment, hardening, healthchecks, the `queue` image and the `app` build target.
- `compose.production.yaml`: the production overlay. It is always passed explicitly as `-f compose.yaml -f compose.production.yaml`. The monitoring services go under the `monitoring` profile there.
- `github/dependabot.yml` and `github/workflows/ci.yml`: listed as graph neighbors. This file does not say how they use it.
- `CLAUDE.md`: listed as a graph neighbor. The file's content does not show an interaction with it.

## Notes
- **One-file rule:** each key lives in exactly one of the three compose files. Any service listed here must exist in both overlays.
- **No overrides:** overlays never override a value from this file. This avoids `!reset` and `!override`, which break on mappings in podman-compose 1.6.0.
- **No `${VAR:?}` required-variable syntax:** development reads this file too, so it can't require variables.
- **Explicit `-f` disables auto-load:** this is why production must name both files.
- **Digest pins:** images carry `@sha256:` digests. Update the tag and the digest together.
- The header refers to `docs/operate/ways-to-deploy/docker-server.md#the-production-compose-file` for more detail, and says `docker/deploy.sh` always passes both files for production.
