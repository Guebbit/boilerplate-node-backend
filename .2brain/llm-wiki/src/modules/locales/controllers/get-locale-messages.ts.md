---
source: src/modules/locales/controllers/get-locale-messages.ts
sha256: cdf34cf8c7d2f11a9399759000711ef99b4d9c022691d7e68797aa4d95dc32e8
generated_at: 2026-09-23T18:48:39.742510+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-messages.ts

## Purpose

Thin HTTP adapter that exposes `GET /locales/:locale/messages`. It delegates all business logic to `localeService.readMessages` and only handles parameter extraction, response shaping, and error forwarding.

## Key elements

- **`getLocaleMessages`** (exported) — Express handler. Reads `request.params.locale` and optional `request.query.tenant`, calls `localeService.readMessages`, then routes the result through `refused` / `successResponse` / `catchAs` to produce the HTTP reply.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `refused` (detects a refusal in the result) and `catchAs` (wraps unhandled errors into a standardized HTTP error response).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, which serialises the payload and sets status headers.
- **`src/modules/locales/services/index.ts`** — source of `localeService`; its `readMessages(locale, tenant?)` method contains the actual data-fetching logic.
- **`src/modules/locales/routes.ts`** — registers `getLocaleMessages` as the handler for the `GET /locales/:locale/messages` route.
- **`src/types/index.ts`** — exports the `LocaleMessages` interface used as the response payload type.

## Notes

- The `?tenant=` query parameter selects a per-frontend copy of the dictionary; when absent the deployment's default tenant is used. The value is trimmed before being forwarded.
- The endpoint is public and intended to be cacheable. Cache invalidation is tag-based (`locales` tag) and is triggered externally by admin write operations — this controller does not manage caching itself.
- No business logic or validation lives in this file; it is deliberately a one-liner call wrapped in the standard `.then` / `.catch` pattern shared across the codebase's HTTP controllers.
