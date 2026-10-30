---
source: tests/integration/locale.test.ts
sha256: 9e9f7485535c6dfa07b96161f0e90ffc860a8bdf65a7227b461dac1c3ec31fd3
generated_at: 2026-10-29T06:58:55.445819+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale.test.ts

## Purpose

Integration tests that verify per-request locale negotiation end-to-end through the real Express middleware stack. They assert that validation errors, generated-schema rejections, multipart rejections, and framework-level failures (404/400/413) are all answered in the language the client requested, including under 20-way concurrency. The file exists as a regression guard for the `AsyncLocalStorage`-based i18n design — in particular, the concurrency test prevents someone from "simplifying" it to a single mutable global.

## Key elements

- **`emailRefusal(locale)`** — renders the "not an email" message via the same `translator` the app uses, so assertions stay in lock-step with the dictionary.
- **`setupTestDb()`** — called once at module scope; only the multipart case (`PATCH /account`) needs a signed-in user.
- **`signupWith(acceptLanguage?)`** / **`contactWith(acceptLanguage?)`** — thin supertest builders that attach an optional `Accept-Language` header to `POST /account/signup` and `POST /tickets` respectively.
- **`messagesOf(body)`** — normalises the `body.errors[].message` array for assertions.
- **`describe('Accept-Language negotiation')`** — Italian, English default, unsupported-language fallback, q-weight ordering, region-tag matching (`it-CH` → `it`), `Vary: Accept-Language`, multipart locale survival, and the 20-request concurrency guard.
- **`describe('generated-schema validation …')`** — same assertions against the orval-generated `/tickets` schema; includes a "no Zod default on the wire" test that checks every message differs between `en` and `it` without hard-coding copy.
- **`describe('a failure with no message of its own')`** — 404, 400 (malformed JSON), 413 (oversized body), and the `title` / `detail` / `errors[]` envelope shape, all in Italian.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — source of the `translator` import; the public entry point of the i18n module under test.
- **`src/infrastructure/i18n/context.ts`** — implements the `AsyncLocalStorage` store and the `translator(locale)` factory that these tests exercise; the concurrency test is the guard against replacing this mechanism.
- **`tests/support/http.ts`** — provides `api()` (supertest instance bound to the real app) and `authenticateAs()` (used only by the multipart case).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` to create the in-memory database the multipart test needs for the bearer token.

## Notes

- The multipart test targets `PATCH /account` rather than `POST /account/signup` because signup no longer accepts a multipart body. The concern it guards: multer consumes the request stream, and the async-context continuation after that read predates `attachLocale`, so the ALS store is gone unless `upload.ts` re-enters it. JSON-body tests cannot reproduce this because `express.json()` buffers before `attachLocale`.
- The concurrency test (20 interleaved requests, alternating `en`/`it`) is explicitly called out as *the* test that justifies the `AsyncLocalStorage` design over a global `i18next.changeLanguage()`.
- The "no Zod default" test asserts that every Italian message differs from its English counterpart positionally, and that no message matches a raw `key.path` pattern — both checks survive dictionary edits without test maintenance.
- The 404/400/413 tests implicitly verify that `attachLocale` is mounted **before** body-parsing middleware in `createApp`; the test comments note that the global rate-limiter's 429 sits in the same middleware group and is covered by the same ordering.
