---
source: src/app/system-routes.ts
sha256: d0595aeca36c833f358b5fe180947b10fb8dec3aa8924d3e98f9b5d74ca2b807
generated_at: 2026-10-01T12:45:37.315810+00:00
model: ollama:qwen3.8:27b
---

# src/app/system-routes.ts

## Purpose

Express router for process-level routes (root ping, liveness, readiness, `security.txt`) that serve the runtime itself rather than any business domain. It lives at the app level instead of in `src/modules` because it belongs to no single feature.

## Key elements

- **`router`** (exported) — the Express `Router` instance; mounted at `/` by `app/routes.ts`.
- **`GET /`** — client-facing public ping; returns `{ status: "ok" }` via `successResponse`. Used by the frontend's API-down banner.
- **`GET /livez`** — liveness probe. Always returns `200` with an empty body. Intentionally performs no I/O and checks no dependencies.
- **`GET /readyz`** — readiness probe. Returns `200` or `503` (empty body) based on `isServerReady()`. Designed for the orchestrator's load-balancer poll.
- **`GET /.well-known/security.txt`** — RFC 9116 disclosure contact. Returns `text/plain` body from `buildSecurityTxt()`; calls `next()` (→ ordinary 404 envelope) when the required env vars are unset.

## Relationships

- **`src/app/routes.ts`** — imports and mounts this router at `/`.
- **`src/app/config.ts`** — provides `securityTxtSettings()`, read on every `security.txt` request.
- **`src/app/security-txt.ts`** — provides `buildSecurityTxt()` which assembles the response body (or `undefined`).
- **`src/infrastructure/http/response.ts`** — provides `successResponse()` for the root ping envelope.
- **`src/infrastructure/runtime/readiness.ts`** — provides `isServerReady()`, the single gate for `/readyz`.

## Notes

- `/livez` deliberately never touches a dependency: a container restart cannot recover a downed database, so the probe must stay cheap and side-effect-free.
- `/readyz` (and `/livez`) return an **empty body** on purpose—orchestrators poll every few seconds for the container's lifetime and read only the status code; the JSON envelope would be pure overhead.
- `/.well-known/security.txt` is a real Express route, **not** a static file, because `express.static` is configured with `dotfiles: 'ignore'`, which would 404 any `.well-known` path.
- The root `/` is the **client-facing** ping (frontend banner), not an orchestrator probe; don't conflate it with `/livez`.
- A 404 on `security.txt` is signalled by calling `next()`, falling through to the standard 404 envelope mounted after this router in `routes.ts`.
