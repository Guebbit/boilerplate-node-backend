---
source: src/infrastructure/http/middlewares/origin.ts
sha256: 814ea7467e79201ff9a37beecf2da3e51f558eb9f4d611bc9fdc73815491f4d6
generated_at: 2026-10-14T07:57:09.948168+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/origin.ts

## Purpose

A CSRF guard middleware for endpoints that are authenticated solely by a cookie (refresh, logout, SSE stream). It rejects requests whose `Origin` header names a domain outside the allowlist, blocking the request before it acts—complementing CORS, which only prevents the attacker's page from *reading* the response.

## Key elements

- **`requireAllowedOrigin(request, response, next)`** — Exports the sole middleware. Reads the `Origin` header; if it is absent or passes `isAllowedOrigin`, calls `next()`. Otherwise responds `403` with an i18n-ised "forbidden" message via `rejectResponse`.

## Relationships

- **`src/infrastructure/http/origins.ts`** — Provides `isAllowedOrigin`, the allowlist predicate this middleware delegates to.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse`, the uniform 403 error-writer used on rejection.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t()` translation function for the error message.
- **`src/kernel/middlewares/authorizations.ts`** — Sibling guard in the same authentication chain; likely composed before/after this middleware on protected routes.
- **`src/modules/account/routes.ts`** — Applies this middleware to cookie-authenticated account routes (refresh, logout).
- **`src/modules/notifications/routes.ts`** — Applies it to the SSE stream endpoint.
- **`src/modules/observability/routes.ts`** — Applies it to health-check/observability routes that accept browser-originated POSTs.
- **`tests/unit/infrastructure/http/middlewares/origin.test.ts`** — Unit tests covering the allowed-origin, forbidden-origin, and no-origin paths.

## Notes

- A **missing** `Origin` header is deliberately *permitted* (non-browser clients: curl, same-origin navigations, health checks). This mirrors the CORS middleware's behaviour and is intentional, not a gap.
- The file is tagged `@module` and exports exactly one binding; treat it as a leaf in the dependency graph.
- The guard is scoped to cookie-authenticated endpoints only; token-authenticated routes do not need it (tokens are not auto-sent cross-origin).
