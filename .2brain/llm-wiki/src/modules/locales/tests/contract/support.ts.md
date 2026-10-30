---
source: src/modules/locales/tests/contract/support.ts
sha256: c53fc8248113d1655f53019a7a90b0714a0aabd8a25cd335966ed8cd9ccebe6c
generated_at: 2026-10-29T04:25:23.685622+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/support.ts

## Purpose

Shared setup helper for the locales contract test suites. It defines a default language payload and a single function that registers a language by calling the real `POST /locales` route, so that individual test files don't repeat the boilerplate.

## Key elements

- **`PORTUGUESE`** (constant) — Default language object (`tag: 'pt'`, `name: 'Portuguese'`, `nativeName: 'Português'`). Used as the fallback body whenever a test doesn't supply its own.
- **`createLanguage(bearer, body?)`** (async function) — POSTs `body` to `/locales` with the given bearer token. Throws a descriptive `Error` (including status code and response body) if the response is not `201`. On success, returns the `tag` string from the response body.

## Relationships

- **`tests/support/http.ts`** — Provides the `api` HTTP client used by `createLanguage` to issue the POST request.
- **`src/modules/locales/tests/contract/api.contract.test.ts`** — Consumes `createLanguage` / `PORTUGUESE` as part of its per-test setup.
- **`src/modules/locales/tests/contract/translations.contract.test.ts`** — Same shared setup; calls `createLanguage` to obtain a valid language tag before asserting on translation endpoints.

## Notes

- The function hits a **real route** (not a mock); the test environment must already have a running server.
- The `body` parameter is typed `Record<string, unknown>`, so callers can pass arbitrary payloads, but the shape must match what the `/locales` route expects.
- Non-201 responses are treated as setup failures and throw immediately—there is no retry or graceful fallback.
