---
source: src/modules/locales/tests/contract/support.ts
sha256: e3992873af7f510659c2acf5b157646bb170f0bda87f4bd4badc29605e8c30cc
generated_at: 2026-10-15T10:47:23.978051+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/support.ts

## Purpose

Shared setup helper for the locales contract test suites. It registers a language through the real `/locales` route so that the contract tests (`api.contract.test.ts`, `translations.contract.test.ts`) can operate on a known language without duplicating the registration call.

## Key elements

- **`PORTUGUESE`** (const, exported) — Default language payload: `{ tag: 'pt', name: 'Portuguese', nativeName: 'Português' }`. Used as the body for `createLanguage` unless overridden.
- **`createLanguage(bearer, body?)`** (async function, exported) — POSTs to `/locales` with the given Bearer token and body (defaults to `PORTUGUESE`). Throws an `Error` if the response is not `201`; otherwise returns the created language's `tag` string.

## Relationships

- **`tests/support/http.ts`** — Imports the `api` factory (`@tests/http`) to build the HTTP request. All calls go through the real server route, not a mock.
- **`src/modules/locales/tests/contract/api.contract.test.ts`** — Consumes `createLanguage` (and possibly `PORTUGUESE`) as a fixture before exercising API-level contract assertions.
- **`src/modules/locales/tests/contract/translations.contract.test.ts`** — Consumes `createLanguage` (and possibly `PORTUGUESE`) to ensure a language exists before asserting on translation behavior.

## Notes

- The function hard-codes the expectation of a `201` status; a `200` or `409` (e.g., language already registered) will cause a setup failure rather than a graceful fallback. If a test needs to re-run, it must handle the duplicate tag externally.
- `body` is typed as `Record<string, unknown>`, so callers can register any language shape, but the function only reads `response.body.data.tag` from the response.
