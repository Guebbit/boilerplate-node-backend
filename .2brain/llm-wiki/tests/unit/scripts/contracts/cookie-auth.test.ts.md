---
source: tests/unit/scripts/contracts/cookie-auth.test.ts
sha256: fdfb1c854a681604a8ee945da7b7702695a6379ef22e63c1ddc5d929bdf86244
generated_at: 2026-11-08T10:32:45.853618+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/cookie-auth.test.ts

## Purpose

Unit tests for `withCookieAuth`, the post-bundle step that adds a `cookieAuth` security alternative to every operation using bearer auth and injects an origin `403` response on unsafe HTTP methods. The tests verify the function mutates the parsed OpenAPI document correctly across a matrix of operation shapes.

## Key elements

- **`DOCUMENT`** — Inline YAML fixture with five operations covering the cases under test: bearer-only GET/POST, bearer + apiKey DELETE, no-security POST, and cookie-only GET.
- **`run()`** — Helper that parses `DOCUMENT` via `parseOpenApi`, passes the result through `withCookieAuth` (mutating in place), and returns the edited object. Called fresh per test to avoid shared state.
- **`describe('withCookieAuth')`** block — five `it` cases asserting:
  - Cookie is appended alongside bearer (order preserved).
  - Pre-existing alternatives (e.g. `apiKeyAuth`) are retained.
  - `403` is declared on unsafe methods (POST) but not on safe ones (GET).
  - An operation's own `403` response body is not overwritten.
  - Public (no-security) and cookie-only operations are left untouched.

## Relationships

- **`scripts/contracts/cookie-auth.ts`** — Source of the `withCookieAuth` function under test.
- **`scripts/contracts/openapi-document.ts`** — Source of `parseOpenApi`, used to convert the YAML fixture into the in-memory document object the tests mutate.

## Notes

- `withCookieAuth` mutates the document in place; `run()` relies on that side-effect rather than a return value.
- The fixture is defined as a raw YAML string inside the test file rather than a separate `.yml` fixture, keeping the test self-contained.
- Tests assert exact array equality (`toEqual`) on `security` arrays, so the *order* of security schemes is a contract (existing schemes first, `cookieAuth` appended last).
