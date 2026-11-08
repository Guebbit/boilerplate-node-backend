---
source: src/modules/locales/tests/contract/support.ts
sha256: c53fc8248113d1655f53019a7a90b0714a0aabd8a25cd335966ed8cd9ccebe6c
generated_at: 2026-11-08T06:27:18.653919+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/support.ts

## Purpose

Shared setup helper for the locales contract test suites. It registers a language through the real `POST /locales` route so that each contract test case starts from a known, valid state without duplicating HTTP boilerplate.

## Key elements

- **`PORTUGUESE`** — Constant object `{ tag: 'pt', name: 'Portuguese', nativeName: 'Portuguese' }` used as the default language payload for registration.
- **`createLanguage(bearer, body?)`** — Async function that POSTs to `/locales` with the given bearer token and body (defaults to `PORTUGUESE`). Throws a descriptive `Error` if the response is not `201`; otherwise returns the `tag` string from the response body.

## Relationships

- **`tests/support/http.ts`** — Provides the `api` helper (a configured HTTP client) that `createLanguage` uses to issue the actual `POST /locales` request.
- **`src/modules/locales/tests/contract/api.contract.test.ts`** — Consumes `createLanguage` / `PORTUGUESE` to set up state before asserting on the locales API surface.
- **`src/modules/locales/tests/contract/translations.contract.test.ts`** — Consumes `createLanguage` / `PORTUGUESE` to register a language before asserting on translation endpoints.

## Notes

- The function hard-fails (throws) on any non-201 status rather than returning a partial response; callers should not wrap it in a try/catch expecting a graceful fallback.
- The default body is the module-level `PORTUGUESE` constant, so omitting the `body` argument in a test will always create the `pt` tag.
- The error message interpolates the full response body as JSON — useful for debugging but can be verbose in CI logs.
