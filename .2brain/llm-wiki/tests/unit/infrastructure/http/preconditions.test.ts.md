---
source: tests/unit/infrastructure/http/preconditions.test.ts
sha256: c337700bd5822d7d874f5b141da2a3bfd5de15a2b387b28a2f9366976bbb9db6
generated_at: 2026-11-08T10:17:33.633352+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/preconditions.test.ts

## Purpose

Unit tests for the `preconditions` module, verifying that `If-Match` headers are parsed according to RFC 9110 §13.1.1 and that `ETag` responses are stamped correctly. The tests enforce the invariant that any unparseable header yields an empty tag list (i.e. nothing can match) rather than being silently ignored.

## Key elements

- **`requestWith(ifMatch?)`** — local helper that builds a stubbed Express `Request` whose `.get()` returns the given `If-Match` value (or `undefined`).
- **`preconditionOf` tests** — cover: absence of the header (returns `undefined`), a single quoted tag, a comma-separated list with weak (`W/`) prefixes and extra whitespace, the `*` wildcard (returns `etags: 'any'`), and a parameterised suite of malformed inputs (bare numbers, unbalanced quotes, trailing commas, mixed `*`, empty string) all of which must produce `etags: []`.
- **`makeResponse(headers?)`** — local helper that creates a stubbed Express `Response` with a jest-mocked `setHeader` and a `req.headers` object; returns both the response stub and the mock for assertions.
- **`setEtag` tests** — verify that a numeric `editRevision` is written as a quoted `ETag` header; that `if-none-match` is **deleted** from `req.headers` after stamping (to suppress a 304 path); and that a row lacking `editRevision` results in no header being set and `if-none-match` left untouched.

## Relationships

- **`src/infrastructure/http/preconditions.ts`** — the module under test. The test imports `preconditionOf` and `setEtag` directly and exercises their public contracts.
- **`tests/support/stub.ts`** — provides `asStub`, a generic utility used to create minimal object stubs typed as Express `Request` / `Response` so the tests can assert on header access without a live server.

## Notes

- The malformed-input tests use `it.each` with a single expected shape (`{ id, etags: [] }`); adding a new valid header form means inserting a separate `it` case, not extending the parameterised list.
- `preconditionOf` returns `undefined` (not an object) when the header is absent — callers must check for that before reading `etags`.
- `setEtag` mutates `req.headers` in place (deleting `if-none-match`); this is a deliberate side-effect, not a return value, and the test asserts it via property absence rather than via the response.
- The ETag value is always a *quoted* integer (`"12"`); the module does not emit weak (`W/`) tags.
