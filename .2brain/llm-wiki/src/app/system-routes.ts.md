---
source: src/app/system-routes.ts
generated_at: 2026-11-22T02:31:53.222240+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/system-routes.ts

## Purpose
Defines the system-level Express routes that serve the process itself rather than a business domain: the root ping, the `/livez` and `/readyz` probes, and `/.well-known/security.txt`. It lives in `src/app` instead of `src/modules` because these routes belong to no domain's business logic. `src/app/routes.ts` mounts its router at `/`.

## Key elements
- `router` — the exported Express `Router` holding all the routes below.
- `GET /` — public ping for clients (the frontend's API-down banner calls it). Returns `{ status: 'ok' }` with status 200 through `successResponse`. It is not an orchestrator probe.
- `GET /livez` — liveness probe. Returns 200 with an empty body and does no I/O. It never checks dependencies, because a restart would not bring a downed database back.
- `GET /readyz` — readiness probe, meant for a load balancer. Returns 200 if `isServerReady()` is true, otherwise 503, with an empty body.
- `GET /.well-known/security.txt` — RFC 9116 disclosure contact. It builds the body with `buildSecurityTxt(securityTxtSettings())` and sends it as `text/plain; charset=utf-8`. If no body is produced, it calls `next()`.

## Relationships
- `src/app/routes.ts` mounts this router at `/`.
- `src/infrastructure/http/response.ts` provides `successResponse`, used only by the root ping.
- `src/infrastructure/runtime/readiness.ts` provides `isServerReady`, which decides the `/readyz` status code.
- `src/app/security-txt.ts` provides `buildSecurityTxt`, which renders the `/.well-known/security.txt` body.
- `src/app/config.ts` provides `securityTxtSettings`, which is read on each `/.well-known/security.txt` request.
- `tests/contract/route-spec-parity.test.ts` is a related contract test. The file only mentions "the contract" for the empty `/readyz` body.

## Notes
- `/livez` and `/readyz` deliberately return empty bodies rather than the standard response envelope. Orchestrator probes read only the status code, and they are polled every few seconds.
- `/.well-known/security.txt` is an Express route, not a static file. `express.static` runs with `dotfiles: 'ignore'`, which would 404 any `.well-known` path.
- `/.well-known/security.txt` returns 404 until the deployment sets `NODE_SECURITY_CONTACT` and `NODE_SECURITY_EXPIRES`. It returns 404 again once the expiry date has passed, which is checked on every request.
- When `/.well-known/security.txt` has no body, the handler calls `next()` and the request falls through to the ordinary 404 envelope mounted after this router.
- Health-check rationale is documented in `docs/operate/health-checks.md`.
