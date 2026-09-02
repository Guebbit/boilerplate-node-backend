# tests/unit/infrastructure/http/request.test.ts

## Purpose

Unit tests for the `readInput` function (and, by import, `callerContextOf`, `extractAndValidateId`, `isValidObjectId`) in `@infrastructure/http/request`. The file exists because `readInput` is a small, always-in-the-path helper whose failure mode (a crash on a body-less request under Express 5) is invisible to integration and contract suites that only ever send well-formed payloads.

## Key elements

- **`makeRequest(overrides)`** — builds a minimal Express `Request` stub via `asStub`. Simulates Express 5's `body: undefined` (not `{}`) when `contentType` is omitted, and models `req.is(type)` returning `null` / the matched string / `false`.
- **`makeResponse()`** — returns an Express `Response` stub plus a `sent` object that records `.status()` and `.json()` calls.
- **`describe('readInput')`** — the sole test block. Sub-groups:
  - **`precedence`** — pins which source (params / body / query) wins for each `surface` value (`search`, `write`, `delete`, `path`), verifies fallback, key-union, source-exclusion, explicit-`undefined` key dropping, body-less survival, and no-defaulting for pagination.
  - **`ids`** — covers the `ids` option: first-source-wins, body fallback, empty-string fall-through, repeated-key-as-array (takes first entry), and key-absence preservation.
  - **`transport decoding`** — multipart-only coercion of booleans, string arrays, and numbers; verifies that unparseable numbers stay as strings (no `NaN`), empty strings are not coerced to `0`, and JSON bodies are left untouched so downstream validators see the raw type error.

## Relationships

- **`src/infrastructure/http/request.ts`** — the module under test. This file imports `readInput`, `callerContextOf`, `extractAndValidateId`, and `isValidObjectId` and asserts their observable contract.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, the typed-stub factory used to construct the `Request` and `Response` fakes without a full Express app.

## Notes

- The tests are written against **Express 5** semantics: `request.body` is `undefined` (not `{}`) when a request has no body. `makeRequest` omits `contentType` to reproduce this, so any regression that assumes a `{}` default will surface here.
- Multipart decoding (booleans, numbers, stringArrays) is **transport-conditional** — it only fires when `req.is('multipart/form-data')` is truthy. JSON bodies must pass through unchanged so that `z.number()`-style validators can reject a string `'101.5'` with the contract's own message.
- `Object.keys(input).toHaveLength(0)` is used explicitly (not just `toEqual({})`) to guard against spread preserving `undefined`-valued keys, which Mongoose would interpret as a filter clause.
- The precedence table is asserted as a single `it.each` over a const tuple rather than per-surface tests, making the mapping auditable in one place.
