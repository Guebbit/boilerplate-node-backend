---
source: tests/integration/locale.test.ts
sha256: 71537cfa2c117a5e50a3bcec95c0a970de81b9e1c2cc8f2e527198177100d7a9
generated_at: 2026-09-23T20:04:43.497412+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale.test.ts

## Purpose

Integration tests that verify per-request locale negotiation end-to-end through the real middleware stack (`attachLocale` → routes → Zod thunks → `rejectResponse`). They exercise two validation paths—`POST /account/signup` (service-level Zod with per-field `t(...)`) and `POST /feedback/contact` (orval-generated schema with no custom messages)—to confirm that every 422 response speaks the language the client asked for, including under concurrent mixed-language load.

## Key elements

- **`INVALID_SIGNUP`** – Payload guaranteed to fail validation before any repository call, so tests run without a database.
- **`signupWith(acceptLanguage?)`** – Returns a pending supertest `POST /account/signup` with an optional `Accept-Language` header.
- **`contactWith(acceptLanguage?)`** – Same pattern for `POST /feedback/contact`.
- **`messagesOf(body)`** – Flattens `body.errors[]` into an array of `message` strings for assertions.
- **`describe('Accept-Language negotiation')`** – Covers: explicit `it`, default `en`, unsupported-language fallback, q-weight ordering, region-tag matching (`it-CH` → `it`), `Vary: Accept-Language` header, multipart-upload locale survival, and the 20-concurrent-requests concurrency guard.
- **`describe('generated-schema validation answers in the negotiated language')`** – Covers the orval-schema path: Italian/English responses, a language-agnostic "no Zod default leaks" check (Italian ≠ English per index, no raw dictionary keys), and precedence of field-level `t(...)` copy over the global shared map.

## Relationships

- **`tests/support/http.ts`** – Imported as `api` (via the `@tests/http` alias). Provides the supertest-based HTTP client that these tests use to issue requests against the running server; every `signupWith`/`contactWith` call goes through it.

## Notes

- The concurrency test (20 interleaved `en`/`it` requests via `Promise.all`) is the explicit guard against refactoring `@infrastructure/i18n` down to a single global `i18next.changeLanguage()` call, which would let overlapping requests cross-contaminate.
- The multipart test specifically guards the case where `multer` consumes the socket stream, breaking the AsyncLocalStorage context; `src/infrastructure/http/middlewares/upload.ts` re-enters the store after multer—this test is the regression net for that.
- The "no Zod default on the wire" test asserts Italian and English messages differ **by position** without naming any string, so it survives dictionary copy changes while still catching untranslated defaults.
- All tests are intentionally DB/Redis/queue-free: the chosen endpoints reject at the validation layer, making them cheap to run in CI.
