---
source: src/modules/locales/controllers/get-locale-apps.ts
sha256: fa4fe7f498398eb733a0618d1eb2ae02875efe31936840333278fd892c8ea4fb
generated_at: 2026-10-15T10:42:11.392397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-apps.ts

## Purpose

Thin HTTP adapter that exposes `GET /locales/apps`. It calls `localeService.listApps()` and returns the result wrapped in a standard success envelope. The controller knows nothing about *where* the app list originates (environment, config, etc.) — that concern lives in the service layer.

## Key elements

- **`getLocaleApps`** (exported const) — Express handler `(Request, Response) => void`. Ignores the request (prefixed `_request`), calls `localeService.listApps()`, and sends the array as `{ apps: [...] }` via `successResponse<LocaleApps>`.

## Relationships

- **`src/modules/locales/services/index.ts`** — source of `localeService`; the only business logic this file depends on.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the shared helper that serialises the payload and sets the HTTP status.
- **`src/modules/locales/routes.ts`** — the route table that mounts `getLocaleApps` on `GET /locales/apps`.
- **`src/types/index.ts`** — supplies the `LocaleApps` type used to parameterise `successResponse`.

## Notes

- The endpoint is public and intended to be cacheable: the payload is identical for every caller and contains no user-specific data.
- The source of the app list is deliberately hidden behind `localeService` so the deployment can swap it (env var, DB, etc.) without touching this controller.
