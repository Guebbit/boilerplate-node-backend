---
source: tests/integration/locale.test.ts
sha256: 8a8fdee61e0e62b8fb04bb6b1ae39255362e9ef9a1aff5b704c7779f03a65354
generated_at: 2026-11-08T09:42:32.800246+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale.test.ts

## Purpose

Integration tests that exercise the full per-request locale negotiation stack (`attachLocale` middleware → routes → Zod validation thunks → error shaping) against the real Express app. They verify that every response — including pre-route 400/413/404 and multipart paths — is answered in the caller's requested language, and that concurrent requests in different languages never cross-contaminate.

## Key elements

- **`emailRefusal(locale)`** — Renders the email-format validation message via the shared `translator`, used to assert the *content* of a 422 body in a given language.
- **`INVALID_SIGNUP` / `INVALID_CONTACT`** — Fixed payloads that trip Zod validation, guaranteeing rejection before any repository or queue call.
- **`signupWith(acceptLanguage?)` / `contactWith(acceptLanguage?)`** — Build a supertest `Request` for `POST /account/signup` or `POST /tasks`, optionally setting `Accept-Language`.
- **`messagesOf(body)`** — Extracts the `errors[].message` array from a response body for assertion.
- **`describe("Accept-Language negotiation")`** — Covers Italian, English, fallback, q-weight ordering, region-tag matching, `Vary: Accept-Language`, multipart upload locale retention, and the 20-way concurrent interleaving test.
- **`describe("generated-schema validation…")`** — Verifies the orval-generated `/tasks` schema's Zod refusals are translated, and asserts every message differs between `en` and `it` (catches untranslated defaults) without hard-coding copy.
- **`describe("a failure with no message of its own")`** — Confirms pre-route failures (404 unknown route, 400 malformed JSON, 413 oversized body) are also localized, and that the `title` field stays English while `detail`/`errors[]` are translated.

## Relationships

- **`src/infrastructure/i18n/index.ts`** → imports `translator`, the per-request function whose correctness these tests verify.
- **`src/infrastructure/i18n/context.ts`** → supplies the `AsyncLocalStorage`-backed context that `translator` reads from; the concurrency and multipart tests guard its behavior.
- **`tests/support/http.ts`** → provides `api` (supertest app instance) and `authenticateAs` (bearer-token helper for the one signed-in multipart case).
- **`tests/support/setup-test-db.ts`** → `setupTestDb()` bootstraps the single database-dependent path (authenticated `PATCH /account` multipart upload).

## Notes

- The **20-request concurrency test** is the load-bearing guard: it exists specifically to prevent someone replacing the ALS-based context with a global `i18next.changeLanguage()` call (which is async and mutates shared state).
- The **multipart test** targets a real bug: once multer consumes the request stream, the async context re-enters from a socket callback that predates `attachLocale`, so the ALS store is lost. `upload.ts` re-enters the store after multer; this test is the regression guard.
- All cases except the multipart one reject **before** any repository call, so no Redis or queue is needed. The DB is started solely for the `authenticateAs` call.
- The "no Zod default" assertion compares `en` vs `it` messages index-by-index and checks none match a raw key pattern (`/^\w+(?:\.[\w-]+)+$/`), so it stays valid when dictionary copy changes.
- The 400/413/404 tests implicitly assert that `attachLocale` is mounted **before** body-parsing middleware in `createApp`; a test cannot exercise a smaller rate-limit budget without re-loading (and un-booting) the i18n module.
