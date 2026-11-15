---
source: src/modules/locales/tests/integration/blank-tag.test.ts
sha256: ce481ddee109b87726f124829a498024eb6e6711a7a7f04f0ae2dce8ccf76986
generated_at: 2026-11-14T20:23:12.759850+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/blank-tag.test.ts

## Purpose

Integration test verifying that a locale tag that trims to an empty string (e.g. `%20`) produces a 404 response on both `PUT` and `PATCH /locales/{locale}`, rather than hanging or returning an unexpected status. It guards against a class of bugs where whitespace-only identifiers bypass validation and cause indefinite waits.

## Key elements

- **`describe('PUT and PATCH /locales/{locale} with a blank tag')`** — top-level suite; calls `setupTestDb()` once before any test runs.
- **`it('answers 404 to PATCH')`** — sends a `PATCH /locales/%20` with an admin bearer token and body `{ name: 'Blank' }`; asserts `response.status === 404`. Timeout: 15 s.
- **`it('answers 404 to PUT')`** — sends a `PUT /locales/%20` with an admin bearer token and body `{ name, nativeName, direction }`; asserts `response.status === 404`. Timeout: 15 s.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, invoked at the top of the file to prepare an isolated database for the suite.
- **`tests/support/http.ts`** — provides the `api()` supertest-style helper (used to issue `PATCH`/`PUT` requests) and `authenticateAs('admin')` (used to obtain a bearer token).

## Notes

- The locale segment is the URL-encoded space `%20`; the server is expected to normalize it to `''` and treat it as "no matching language," yielding the standard 404 path. The 15-second timeouts are intentionally generous to make a hang fail fast rather than blocking CI indefinitely.
- The file has no exports; it is a self-contained test module.
