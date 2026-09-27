---
source: tests/integration/locale.test.ts
sha256: 53175600161bcbdf556dfcbc430da69f0aebd8836c7ab5abab1e0b0c294e35b9
generated_at: 2026-09-27T15:56:21.285487+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale.test.ts

## Purpose

Integration tests that verify per-request locale negotiation across the full middleware stack (`attachLocale`, routes, Zod thunks, `rejectResponse`) using two endpoints that reject at validation before any repository call — so no database, Redis, or queue is needed. The file guards two specific regression risks: concurrent requests leaking each other's language (the reason `AsyncLocalStorage` exists instead of `i18next.changeLanguage()`), and Zod's built-in English messages leaking through generated-schema validation.

## Key elements

- **`signupWith(acceptLanguage?)`** — builds a `supertest` POST to `/account/signup`, optionally setting the `Accept-Language` header.
- **`INVALID_SIGNUP`** — a payload that triggers a 422 on every field, ensuring validation (and therefore locale negotiation) is exercised.
- **`messagesOf(body)`** — extracts the `message` strings from a standard `{ errors: [{ message }] }` response shape.
- **`contactWith(acceptLanguage?)`** / **`INVALID_CONTACT`** — same pattern for `POST /feedback/contact`, which validates via an orval-generated schema (no per-field messages) rather than `zodUserSchema`.
- **`describe("Accept-Language negotiation")`** — six tests: explicit `it`, default `en`, unsupported-language fallback, q-weight ordering, region-tag matching (`it-CH` → `it`), `Vary: Accept-Language` header, and multipart-upload locale preservation.
- **`describe("generated-schema validation answers in the negotiated language")`** — four tests covering Italian/English responses, a "no Zod default on the wire" check (asserts all messages differ between the two languages without naming specific copy), and per-field `t(...)` precedence over the shared validation map.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` factory (a configured `supertest` instance against the running app). Every request in this file goes through it; the file has no other way to reach the HTTP layer.
- **Locale JSON files** (`@modules/users/locales/{en,it}.json`, `../../src/locales/{en,it}.json`) — imported directly to build expected-message assertions against known dictionary keys, avoiding hard-coded English/Italian strings.

## Notes

- The concurrency test (`never answers one request in another request's language`) is the load-bearing case: 20 interleaved requests in flight simultaneously. It exists specifically to prevent a "simplification" that replaces AsyncLocalStorage with a global `changeLanguage()` call.
- The multipart test documents a concrete past bug: `upload.image()` consumes the request stream, and the subsequent socket-read callback resumes in an async context that predates `attachLocale`, so the ALS store is empty. The fix lives in `src/infrastructure/http/middlewares/upload.ts` (re-entering the store after multer); this test is the regression guard.
- The "never leaves a Zod default on the wire" test deliberately asserts *structural* differences (messages differ at every index, no raw dot-notation keys) rather than specific translated strings, so it survives dictionary edits without updates.
- The per-field-precedence test (`still lets a field with its own copy win`) asserts that the shared `validation-messages` map does not overwrite a field-level `t(...)` sentence — the global map is a fallback, not an override.
