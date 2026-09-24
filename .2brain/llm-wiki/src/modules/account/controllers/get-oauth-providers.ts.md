---
source: src/modules/account/controllers/get-oauth-providers.ts
sha256: 8286a7078107b48587e1622abe0f4746d6201b0fb621e78d0f2c5221c213bfdf
generated_at: 2026-09-23T18:00:31.304307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-providers.ts

## Purpose

Thin HTTP adapter for `GET /account/oauth/providers`. It exposes the set of enabled OAuth providers for the current deployment so the frontend can render the correct "Continue with…" buttons without hardcoding a list.

## Key elements

- **`getOAuthProviders`** (exported) — Express handler that calls `enabledProviders()` and wraps the result in a standard success envelope via `successResponse`. The request parameter is intentionally unused (`_request`).

## Relationships

- **`src/modules/account/routes.ts`** — imports `getOAuthProviders` and registers it on the `GET /account/oauth/providers` route.
- **`src/modules/account/oauth/providers/index.ts`** — source of `enabledProviders()`, the single piece of domain logic this controller depends on.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the shared helper that shapes the JSON reply.
- **`src/types/index.ts`** — supplies the `OAuthProviders` type used as the generic constraint on `successResponse`.

## Notes

- The controller contains no business logic by design; all provider-eligibility decisions live in `enabledProviders()`.
- The response body is `{ providers: OAuthProviders }` — consumers should expect the provider list under the `providers` key, not at the top level.
