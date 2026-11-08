---
source: src/app/system-routes.ts
sha256: 42f23eda7ba6427048c8a9b3dbcd68b8dc9036a67aa5021b21a71b482e83eebb
generated_at: 2026-11-08T03:14:30.000837+00:00
model: ollama:qwen3.8:27b
---

# src/app/system-routes.ts

## Purpose

Defines an Express `Router` for process-level endpoints that are not part of any domain module: the root ping, Kubernetes liveness/readiness probes, and the `security.txt` disclosure contact. It exists so that operational and compliance routes stay out of `src/modules`, where business-logic routes live.

## Key elements

- **`router`** (exported `Express.Router`) — the single export; mounted at `/` by `app/routes.ts`.
- **`GET /`** — public ping returning `{ status: 'ok' }` via `successResponse`. Used by the frontend's API-down banner; distinct from orchestrator probes.
- **`GET /livez`** — liveness probe. Always `200` with an empty body. Deliberately performs no I/O so a container HEALTHCHECK failure does not trigger a restart that cannot fix a downstream dependency.
- **`GET /readyz`** — readiness probe. Returns `200` or `503` based on `isServerReady()`; empty body by contract (load-balancer probes read only the status code).
- **`GET /.well-known/security.txt`** — RFC 9116 contact. Delegates to `buildSecurityTxt(securityTxtSettings())`; if that returns `undefined` (env vars unset or expired), calls `next()` to fall through to the 404 envelope.

## Relationships

- **`src/app/routes.ts`** — mounts `router` at the root path; this file has no other mount points.
- **`src/app/config.ts`** — supplies `securityTxtSettings()`, the env-var-derived input to the `security.txt` handler.
- **`src/app/security-txt.ts`** — supplies `buildSecurityTxt()`, which formats the RFC 9116 body or returns `undefined`.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse()`, used only by the root ping handler.
- **`src/infrastructure/runtime/readiness.ts`** — supplies `isServerReady()`, the boolean that drives the `/readyz` status code.
- **`tests/contract/route-spec-parity.test.ts`** — contract test asserting that the routes defined here match the OpenAPI/spec route table.

## Notes

- **security.txt is a route, not a static file.** `express.static` runs with `dotfiles: 'ignore'`, which would 404 any path under `.well-known/`. The route approach sidesteps that.
- **404 fall-through on security.txt.** When `buildSecurityTxt` returns `undefined`, the handler calls `next()`; the response is produced by whatever 404 middleware is mounted *after* this router in `routes.ts`. Do not add a local 404 here.
- **Empty bodies on `/livez` and `/readyz` are intentional.** The orchestrator contract (see `docs/tools/health-checks.md`) reads only the status code; wrapping them in the standard JSON envelope would add unnecessary bytes on a probe polled every few seconds for the container's lifetime.
- **`/livez` never inspects dependencies.** A liveness failure causes a restart, which cannot recover a downed database. Readiness (`/readyz`) is the probe that reflects dependency health.
