---
source: src/app/config-routes.ts
sha256: cf83e20a56fc7179833a65a0c6d8bcc5b3217a489c5b34c48da998f18f466f75
generated_at: 2026-11-08T03:12:34.670047+00:00
model: ollama:qwen3.8:27b
---

# src/app/config-routes.ts

## Purpose

Defines the public `GET /config` endpoint, which returns a single composite payload that a client needs *before* it has a session: session config, OAuth providers, antibot/challenge config, support email, operator identity, and terms version. The handler lives here (rather than inside any one module) because the response composes data owned by multiple modules and the operator-legal-identity fields must remain available even when optional features (e.g. the shop) are removed.

## Key elements

- **`router`** (exported) — Express `Router` instance, mounted at `/` by `routes.ts`.
- **`CACHE_CONTROL`** — Constant `'public, max-age=60'`; applied only on successful responses. All values are read from environment at boot, so a minute is "fresh enough" after a restart.
- **`GET /config` handler** — Calls `antibotService.config()` (the only async step), then assembles the `Config` object from synchronous getters and sends it via `successResponse`. On rejection (e.g. unknown antibot provider/email policy), delegates to `catchAs(response, 'getConfig')`.

## Relationships

- **`src/app/routes.ts`** — Mounts this file's `router` at the app root.
- **`src/modules/account/index.ts`** — Source of `accountService` (session config, OAuth providers), `operatorIdentity`, and `termsVersion`.
- **`src/modules/antibot/index.ts`** — Source of `antibotService.config()`, the sole async call in the handler.
- **`src/infrastructure/adapters/config.ts`** — Provides `supportEmail()` (reads `NODE_SUPPORT_EMAIL`).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse<T>()` for the JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs()` for structured error serialization.
- **`src/types/index.ts`** — Defines the `Config` shape the endpoint returns.
- **`tests/contract/route-spec-parity.test.ts`** — Asserts this route's response contract stays in sync with the OpenAPI/spec definition.

## Notes

- The `Cache-Control` header is set **after** the Promise resolves, so a rejection (unknown provider) never carries a cacheable header — a refusal is always `no-store` via the app-wide default.
- `GET /shop` is deliberately a separate endpoint; the operator identity and terms version are duplicated here rather than living under `/shop` so the config remains valid when the shop module is uninstalled.
- The handler uses a raw `.then/.catch` chain rather than `async/await` because the single async call (`antibotService.config()`) is the only non-deterministic step; everything else is a synchronous getter.
