---
source: tests/unit/infrastructure/http/request.test.ts
sha256: f3a2ec3164d42ad4c014911c70f38d61002105caf6b2578f469d87fc17741175
generated_at: 2026-11-08T10:17:58.078886+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/request.test.ts

## Purpose

Unit tests for `readInput` and its transport-decoding helpers (`parseFormBoolean`, `parseFormCsvList`, `callerContextOf`) from `@infrastructure/http/request`. They lock down the surface-based source precedence chain, ID fallback semantics, and the multipart-only type coercion rules that every controller depends on, using a minimal hand-built express Request stub rather than a full integration harness.

## Key elements

- **`makeRequest(overrides)`** – Factory returning an `asStub<Request>` with `params`, `body`, `query`, and a realistic `is()` method (returns the matched type string, `false` on mismatch, `null` when no body). This is the only way the tests model express content-type negotiation.
- **`describe('readInput') > 'precedence'`** – Verifies which source wins for each surface (`search`→body, `write`→params, `delete`→params, `path`→params), that lower-precedence sources are read only when the higher one is absent, that keys unique to one source survive, that invisible sources are truly ignored, that `undefined`-valued keys are dropped, and that a body-less request (`body === undefined`, express 5) does not throw.
- **`describe('readInput') > 'ids'`** – Covers the `ids` option: first source with a non-empty value wins, empty strings fall through, a repeated key (array) is preserved as an array so downstream validation can 422, and a wholly absent key is not injected.
- **`describe('readInput') > 'transport decoding'`** – Asserts that booleans, CSV string arrays, and numbers are coerced **only** when `Content-Type` is multipart/form-data. JSON bodies pass through untouched so schema validators see the original type error. Unparseable numbers stay as strings (not `NaN`); empty strings stay empty (not `0`).

## Relationships

- **`src/infrastructure/http/request.ts`** – The module under test; all four exported symbols (`readInput`, `callerContextOf`, `parseFormBoolean`, `parseFormCsvList`) are exercised here.
- **`tests/support/stub.ts`** – `asStub` is used to give the hand-built request object a `Request` type without pulling in a full express test harness.
- **`tests/support/callers.ts`** – `asCustomer` constructs the caller object passed into `callerContextOf` tests (visible in the import; exercised in the truncated portion of the file).
- **`src/kernel/permissions.ts`** – `callerInScope` is imported for the `callerContextOf` cases that verify scope-gated access.

## Notes

- **Express 5 body is `undefined`, not `{}`.** Several tests explicitly set `body: undefined` (via omitted `contentType`) to reproduce the real crash path. If the codebase ever pins back to express 4, those cases will need revisiting.
- **`is()` return contract.** The stub mimics express: matched type string → truthy, mismatched type → `false`, no body → `null`. Any test that skips `contentType` is exercising the "no body at all" branch.
- **Transport-conditional coercion is intentional and asymmetric.** JSON `"101"` for a number field must remain a string so `z.number()` rejects it; the same string in multipart must become `101`. Tests on both sides guard this.
- **`undefined` values are dropped, not spread.** A body like `{ text: undefined }` yields an empty object, not `{ text: undefined }`. This matters because Mongoose interprets `field: undefined` as a filter clause.
- **Defaults and pagination bounds are out of scope here.** `readInput` reports absence; `normalizePagination` (in `@infrastructure/persistence/search`) applies defaults and 1–100 bounds. See `tests/cross-cutting/search-pagination.test.ts`.
