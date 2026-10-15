---
source: tests/unit/infrastructure/http/middlewares/content-type.test.ts
sha256: 14f0c8f759f62e292a87b128a900cbd34af664abc6c72faf8d04f7edf11b4399
generated_at: 2026-10-15T13:11:55.058530+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/content-type.test.ts

## Purpose

Unit tests for the `requireDeclaredContentType` middleware (the 415 guard). Each test runs the guard against a **real Express request object** so that `request.is`—Express's own media-type matcher—is the code under test rather than a mock, ensuring production and test use the same matching logic.

## Key elements

- **`TABLE`** – Fixture array of `RequestContentType` entries covering four routes: a JSON-only POST, a form-encoded POST, a PATCH that also accepts `merge-patch+json`, and a parameterised restore POST.
- **`Sent`** (interface) – Describes the minimal fields a test request must carry: `method`, `path`, optional `type` (Content-Type header), optional `length` (Content-Length; `0` means header present but empty body).
- **`run(sent)`** – Helper that constructs a real Express request via `Object.create(express.request)` + `Object.defineProperties`, builds a stub `Response` (recording `status`/`json` calls), invokes `requireDeclaredContentType(TABLE)`, and returns `{ status?, body?, passed }`.
- **`describe('requireDeclaredContentType')`** – Behavioural tests: accepted type passes, wrong type returns 415 with `UNSUPPORTED_MEDIA_TYPE` and the accepted list, merge-patch accepted/refused per route, zero-byte body bypasses the check, static route wins over parameterised, trailing slash still matches, unknown route passes through.
- **`describe('the generated operation table')`** – Invariant test asserting that `REQUEST_CONTENT_TYPES` is sorted by `parameterCount` ascending, which the guard relies on to match static routes before parameterised ones.

## Relationships

- **`src/infrastructure/http/middlewares/content-type.ts`** – Source of `requireDeclaredContentType`, the unit under test. The test also imports the `RequestContentType` type and the `REQUEST_CONTENT_TYPES` constant (via `@api/request-content-types`) to build its table and verify ordering.
- **`tests/support/stub.ts`** – Provides `asStub`, used to create the lightweight `Response` double that records `status()` and `json()` calls.

## Notes

- `path` is a **getter** on Express's request prototype; the test redefines it with `Object.defineProperties` rather than a plain assignment.
- `content-length` defaults to `5` when `Sent.length` is omitted, simulating a non-empty body. The `length: 0` case explicitly tests the "zero-byte request is always allowed" rule.
- The table ordering invariant (ascending `parameterCount`) is a **contract with the generated table**, not just a test-internal detail—breaking it would silently change which route matches first in production.
