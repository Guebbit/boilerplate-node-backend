---
source: src/app/system-routes.ts
sha256: 42f23eda7ba6427048c8a9b3dbcd68b8dc9036a67aa5021b21a71b482e83eebb
generated_at: 2026-10-29T01:51:17.659007+00:00
model: ollama:qwen3.8:27b
---

# src/app/system-routes.ts

## Purpose

Defines the process-level HTTP routes that exist outside any business domain: the root ping, Kubernetes-style liveness/readiness probes, and the RFC 9116 `security.txt` endpoint. Kept in `src/app` (not `src/modules`) because none of these routes serve domain logic.

## Key elements

- **`router`** (exported `express.Router`) — the single export; mounted at `/` by `app/routes.ts`.
- **`GET /`** — public "is the server alive" ping used by the frontend's API-down banner. Responds via `successResponse` with `{ status: 'ok' }`.
- **`GET /livez`** — liveness probe. Returns `200` with an empty body; deliberately performs no I/O so a container restart is never triggered by a transient dependency outage.
- **`GET /readyz`** — readiness probe for the load balancer. Returns `200` or `503` (empty body) based on `isServerReady()` from `@infrastructure/runtime/readiness`.
- **`GET /.well-known/security.txt`** — RFC 9116 disclosure contact, built by `buildSecurityTxt(securityTxtSettings())`. Implemented as an Express route (not a static file) because `express.static` is configured with `dotfiles: 'ignore'`. Calls `next()` (falling through to the shared 404 envelope) when the contact/expiry env vars are unset or the expiry has passed.

## Relationships

- **`src/app/routes.ts`** — imports and mounts this file's `router` at `/`.
- **`src/app/config.ts`** — provides `securityTxtSettings()` (reads `NODE_SECURITY_CONTACT` / `NODE_SECURITY_EXPIRES`).
- **`src/app/security-txt.ts`** — provides `buildSecurityTxt()`, which formats the RFC 9116 body or returns `undefined`.
- **`src/infrastructure/http/response.ts`** — provides `successResponse()` used by the root ping.
- **`src/infrastructure/runtime/readiness.ts`** — provides `isServerReady()` consumed by `/readyz`.
- **`tests/contract/route-spec-parity.test.ts`** — contract test asserting these routes match an external route-spec (e.g., status codes, presence of endpoints).

## Notes

- `/livez` and `/readyz` intentionally return **empty bodies** (no JSON envelope) because orchestrator/load-balancer probes read only the status code, and the envelope would be serialised on every poll for the lifetime of the container.
- The `/.well-known/security.txt` route calls `next()` rather than sending a 404 itself, relying on the 404 handler mounted *after* this router in `app/routes.ts`.
- `securityTxtSettings()` is called **per request**, so changing the expiry requires no restart.
