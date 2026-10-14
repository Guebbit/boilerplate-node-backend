---
source: src/infrastructure/http/origins.ts
sha256: 6aba29466ad8b6a6ce6d26d58376184859bf0e3870d1db2ea38096ebcd865f80
generated_at: 2026-10-14T07:59:15.731075+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/origins.ts

## Purpose

Centralises the single source of truth for "which browser origins may call this API with credentials." It exists so that the CORS middleware and the server-side origin guard reference the same allow-list and never diverge, which would let a request pass the server guard while the browser's CORS check blocks it.

## Key elements

- **`isAllowedOrigin(origin: string): boolean`** — the sole export. Checks whether `origin` appears in `siteConfig().NODE_CORS_ORIGIN`. Blank entries are dropped and an unset variable falls back to a developer default (both handled inside `siteConfig`). Because the lookup happens at *call time* rather than import time, tests that mutate `NODE_CORS_ORIGIN` afterwards are honoured without a restart.

## Relationships

- **`src/infrastructure/http/config.ts`** — provides `siteConfig`, which supplies the `NODE_CORS_ORIGIN` array used by `isAllowedOrigin`.
- **`src/app/security.ts`** — the CORS middleware that calls `isAllowedOrigin` (or is expected to agree with it) when building `Access-Control-Allow-Origin` responses.
- **`src/infrastructure/http/middlewares/origin.ts`** — the server-side origin guard; it must consult the same list so that a request the browser would refuse under CORS cannot still mutate server state.

## Notes

- The allow-list is read **per request** (call-time), not cached at module load. Do not "optimise" this to a top-level constant without breaking the test pattern described in the JSDoc.
- This file intentionally exports only one function; keep it that way so both consumers (security.ts and the origin middleware) have a single, auditable point to change.
