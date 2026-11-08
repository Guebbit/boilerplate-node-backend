---
source: src/infrastructure/http/origins.ts
sha256: 6aba29466ad8b6a6ce6d26d58376184859bf0e3870d1db2ea38096ebcd865f80
generated_at: 2026-11-08T03:33:30.805609+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/origins.ts

## Purpose

Single source of truth for "which browser origins are allowed to call this API with credentials." It exists so the CORS middleware and the origin guard cannot drift apart—mismatched allow-lists would let a request the browser blocks via CORS still execute server-side.

## Key elements

- **`isAllowedOrigin(origin: string): boolean`** — The only export. Checks whether `origin` appears in the `NODE_CORS_ORIGIN` list (blank entries dropped, unset falls back to a developer default, both handled by the config field). Called at invocation time, not import time, so mutating the environment variable in a test is reflected immediately.

## Relationships

- **`src/infrastructure/http/config.ts`** — Imports `siteConfig`, which supplies the `NODE_CORS_ORIGIN` array that `isAllowedOrigin` searches.
- **`src/app/security.ts`** — The CORS middleware that calls `isAllowedOrigin` to decide which `Access-Control-Allow-Origin` header to set.
- **`src/infrastructure/http/middlewares/origin.ts`** — The origin guard middleware that also calls `isAllowedOrigin` to reject requests from disallowed origins before routing.

## Notes

- The check is a simple `Array.includes`; the order and normalization of entries is delegated entirely to `siteConfig`'s `NODE_CORS_ORIGIN` getter (blank-stripping, default fallback, etc.).
- Because the lookup happens at call time, `NODE_CORS_ORIGIN` can be changed between requests (useful in tests) without a process restart.
