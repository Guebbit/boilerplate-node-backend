---
source: src/infrastructure/http/origins.ts
source_sha256: 6aba29466ad8b6a6ce6d26d58376184859bf0e3870d1db2ea38096ebcd865f80
context_sha256: 5fe8eb018793b2d6fcad2aecf60383609f790913d48f6d9c74aae4f4a598c1d0
generated_at: 2026-11-22T02:52:54.358074+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/origins.ts

## Purpose
Single source of truth for which browser origins may call this API with credentials. The CORS middleware and the origin guard both use it, so a request that CORS would refuse in the browser can't still act on the server.

## Key elements
- `isAllowedOrigin(origin: string): boolean` returns whether `origin` (an `Origin` header value) is in `siteConfig().NODE_CORS_ORIGIN`. The check is an array `includes`, so it is an exact string match.

## Relationships
- `./config`: imports `siteConfig`. The allowed-origin list comes from its `NODE_CORS_ORIGIN` field.
- `src/app/security.ts`: the CORS middleware, which the module doc names as one of the two consumers that must agree on the allowed list.
- `src/infrastructure/http/middlewares/origin.ts`: the origin guard, the other consumer named in the module doc.

## Notes
- `siteConfig()` is called on every invocation, not cached. A test that sets `NODE_CORS_ORIGIN` after import is therefore honoured.
- Blank-entry filtering and the developer default for an unset variable are handled by the config field, not in this file.
