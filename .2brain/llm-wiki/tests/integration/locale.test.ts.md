---
source: tests/integration/locale.test.ts
sha256: 166ff17609c0d7bd6cb9632effe52c0c50f2441eb5cf8552eb010738d19e5e83
generated_at: 2026-11-14T23:17:39.989288+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale.test.ts

## Purpose

Integration tests that exercise the full per-request locale-negotiation stack (middleware → routes → Zod thunks → error shaping) by driving real HTTP requests against the app. The subject is `POST /account/signup` (and a few other endpoints) because validation rejects before any repository call, so no Redis or queue is needed. The tests guard against the i18n system being "simplified" into a single mutable global language.

## Key elements

- **`emailRefusal(locale)`** — Renders the "not an email" validation message for a given locale using the same `translator` the app uses, so assertions stay in lockstep with the dictionary.
- **`signupWith(acceptLanguage?)`** — Builds a POST to `/account/signup` via `api()`, optionally setting an `Accept-Language` header.
- **`contactWith(acceptLanguage?)`** — Same pattern for `POST /tasks` (orval-generated schema path).
- **`messagesOf(body)`** — Extracts the flat array of error messages from a 422 response body.
- **`describe('Accept-Language negotiation')`** — Covers: explicit `it`/`en`, default, unsupported-language fallback, q-weight ordering, region-tag (`it-CH`) matching, `Vary: Accept-Language` header, multipart upload (only case needing a DB for auth), and a 20-request concurrency test.
- **`describe('generated-schema validation …')`** — Confirms the `/tasks` controller-parsed path answers in the negotiated language, plus a guard that no Zod default string leaks identically in both languages.
- **`describe('a failure with no message of its own')`** — Drives 404 (unknown route), 400 (malformed JSON), and 413 (oversized body) in Italian to verify `attachLocale` runs before request parsing.

## Relationships

- **`src/infrastructure/i18n/context.ts`** — The `AsyncLocalStorage`-backed locale store under test. The concurrency and multipart cases specifically verify its per-request isolation.
- **`src/infrastructure/i18n/index.ts`** — Barrel export supplying `translator`, imported directly by this file for rendering expected messages.
- **`tests/support/http.ts`** — Provides the `api()` request helper and `authenticateAs()` used for the multipart case.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope; only the multipart test actually touches the database (to sign a caller in).

## Notes

- The **concurrency test** (20 interleaved requests, alternating `en`/`it`) is the primary guard against replacing `AsyncLocalStorage` with a single `i18next.changeLanguage()` global. If someone "simplifies" the i18n context, this test is what fails.
- The **multipart test** exists because `upload.image()` consumes the request stream, causing subsequent async work to resume in a context that predates `attachLocale`. JSON bodies are already buffered by `express.json()` before the middleware runs, so they cannot expose this bug.
- The **Zod-default guard** asserts that every message differs between the Italian and English responses *without naming specific copy*, so it survives dictionary edits. It also checks no raw i18n key (e.g. `validation.format-email`) escapes to the client.
- The **no-message tests** (404/400/413) implicitly verify that `attachLocale` is mounted ahead of `express.json()` / body-size limits in `createApp`; re-ordering that chain would break them.
- Only the multipart case calls `setupTestDb()`; every other assertion path rejects before any repository access, keeping the suite free of Redis/queue dependencies.
