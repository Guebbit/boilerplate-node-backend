---
source: src/app/system-routes.ts
sha256: 838fc2e7bdece08bdb037d9faae3dc59fd3e7c3a0ce450e02e567f5f412c72b3
generated_at: 2026-10-14T07:39:35.359234+00:00
model: ollama:qwen3.8:27b
---

# src/app/system-routes.ts

## Purpose

Defines the process-level HTTP routes that have no domain owner: the root ping, Kubernetes-style liveness/readiness probes, and the RFC 9116 `security.txt` endpoint. Kept at the `app/` level (not in `src/modules`) because it belongs to the process itself rather than any business-logic module. Mounted at `/` by `app/routes.ts`.

## Key elements

- **`router`** (export) — Express `Router` instance; the single export of this file.
- **`GET /`** — Public ping. Returns `{ status: 'ok' }` via `successResponse`. This is the endpoint the frontend's "API-down" banner polls; it is *not* an orchestrator probe.
- **`GET /livez`** — Liveness probe. Always `200`, empty body, zero I/O. Deliberately never checks dependencies: a container restart cannot recover a downed database.
- **`GET /readyz`** — Readiness probe. Returns `200` or `503` based on `isServerReady()`. Empty body by contract—orchestrators read the status code, not JSON, and this endpoint is polled every few seconds for the container's lifetime.
- **`GET /.well-known/security.txt`** — RFC 9116 disclosure contact. Served as `text/plain`. Returns `404` (falls through to the next middleware) when the required env vars are unset or the expiry date has passed (checked per request, not at startup).

## Relationships

- **`src/app/routes.ts`** — Mounts this file's `router` at `/`.
- **`src/app/config.ts`** — Provides `securityTxtSettings()` to drive the `security.txt` response.
- **`src/app/security-txt.ts`** — Provides `buildSecurityTxt()`, which constructs the response body (or `undefined` to signal a 404).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse()` used by the root ping.
- **`src/infrastructure/runtime/readiness.ts`** — Provides `isServerReady()`, the sole gate for `/readyz`.
- **`tests/contract/route-spec-parity.test.ts`** — Contract test asserting this file's route set matches an external route spec.

## Notes

- `security.txt` is an Express route, **not** a static file: `express.static` is configured with `dotfiles: 'ignore'`, which would 404 any `.well-known/*` path.
- The 404 for `security.txt` is achieved by calling `next()` so the standard 404 envelope (mounted after this router in `routes.ts`) handles it—there is no explicit 404 response here.
- `/livez` and `/readyz` intentionally return empty bodies; do not add JSON envelopes to them. The root `/` is the only system route that uses the `successResponse` envelope.
- The readiness check is evaluated per request, so a dependency can recover without a container restart; the liveness check is a constant `200` by design.
