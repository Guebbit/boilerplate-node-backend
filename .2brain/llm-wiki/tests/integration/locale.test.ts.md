---
source: tests/integration/locale.test.ts
sha256: 67a5f595e356603a08329b0ba5756393efe706d83f2e8c8e2ffe8352f78a3bcf
generated_at: 2026-10-15T12:48:16.560190+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale.test.ts

## Purpose

Integration tests that verify per-request locale negotiation end-to-end. They drive the real middleware stack (`attachLocale`, routes, Zod validation thunks, error shaping) against `POST /account/signup` and `POST /feedback/contact` — two endpoints that reject before any repository call — to confirm that validation messages, `Content-Language`, and `Vary` headers reflect the negotiated language. The most critical tests guard against locale leaking across concurrent requests and against `AsyncLocalStorage` being lost after a multipart stream is consumed.

## Key elements

- **`emailRefusal(locale)`** — renders the "not an email" validation message in the given locale using the same `translator` the app uses, so assertions compare against the live dictionary.
- **`signupWith(acceptLanguage?)`** — builds a `POST /account/signup` request via `api()`, optionally setting `Accept-Language`.
- **`contactWith(acceptLanguage?)`** — same pattern for `POST /feedback/contact` (controller-parsed, orval-generated schema).
- **`messagesOf(body)`** — extracts the `message` strings from a `422` error body for assertion.
- **`describe('Accept-Language negotiation')`** — seven tests covering: Italian, English default, unsupported-language fallback, q-weight ordering, region-tag matching (`it-CH` → `it`), `Vary: Accept-Language` header, multipart locale preservation, and a 20-request concurrency isolation test.
- **`describe('generated-schema validation …')`** — three tests for the orval-schema path, including "never leaves a Zod default on the wire," which asserts every message differs between IT and EN without naming specific copy, and that no raw dictionary key escapes.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — barrel re-export; the test imports `translator` from here.
- **`src/infrastructure/i18n/context.ts`** — provides the `AsyncLocalStorage`-backed context that `attachLocale` populates; the concurrency and multipart tests are regression guards for its correctness.
- **`tests/support/http.ts`** — supplies `api()` (supertest wrapper) and `authenticateAs()` (bearer-token helper) used by every request in the file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level so the single multipart test can sign a user in; all other tests reject before touching the DB.

## Notes

- The concurrency test (20 interleaved requests, alternating `en`/`it`) is the primary guard against "simplifying" the i18n layer to a single `i18next.changeLanguage()` global. Removing it would allow that regression.
- The multipart test uses `PATCH /account` (not signup) because signup no longer declares a multipart body. It exercises the re-entry fix in `src/infrastructure/http/middlewares/upload.ts` where the `AsyncLocalStorage` store is re-set after multer consumes the stream.
- `setupTestDb()` runs unconditionally at import time even though only one test needs it; the other tests reject at the validation layer and never hit the database.
- The "no Zod default" test intentionally avoids hardcoding translated strings, so it survives dictionary edits; it only asserts structural inequality and absence of raw `dotted.key` keys.
