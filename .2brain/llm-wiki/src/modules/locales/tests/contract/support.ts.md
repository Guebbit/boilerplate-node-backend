---
source: src/modules/locales/tests/contract/support.ts
source_sha256: c53fc8248113d1655f53019a7a90b0714a0aabd8a25cd335966ed8cd9ccebe6c
context_sha256: a1870455d8dc9435155c5ff95f7b61b933f9ab0f5a4fc5f04410996ca6e1c93e
generated_at: 2026-11-22T05:49:19.563873+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/contract/support.ts

## Purpose
Shared setup helper for the locales contract test suites. It registers a language through the real `POST /locales` route so tests can start from a known state, and fails loudly if that setup does not succeed.

## Key elements
- `PORTUGUESE` — default language fixture: `{ tag: 'pt', name: 'Portuguese', nativeName: 'Português' }`.
- `createLanguage(bearer, body = PORTUGUESE)` — sends `POST /locales` with the given `Authorization` header value and body. Returns `response.body.tag` as a string. Throws an `Error` if the status is not `201`. The message includes the status and the JSON response body.

## Relationships
- Imports `api` from `@tests/http` (`tests/support/http.ts`) to issue the HTTP request.
- Intended for the sibling contract suites, `api.contract.test.ts` and `translations.contract.test.ts`, which share this setup.

## Notes
- `bearer` is passed straight to the `Authorization` header, so callers must supply the full value (e.g. including any `Bearer ` prefix).
- Only `201` counts as success. Any other status, including a duplicate-tag conflict, throws.
- Because it goes through the real route rather than inserting directly, a failure here points to a problem in the locale creation endpoint or in auth setup, not in the test under way.
