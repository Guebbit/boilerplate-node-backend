# tests/unit/infrastructure/http/request.test.ts

## Purpose

Unit tests for `readInput` (and, by import, `callerContextOf`, `extractAndValidateId`, `isValidObjectId`) in `@infrastructure/http/request`. Because `readInput` is reached by every controller, the integration and contract suites exercise it without probing its edge cases; this file pins the precedence chain, ID resolution, and multipart transport-decoding rules that are easy to regress silently.

## Key elements

- **`makeRequest(overrides)`** — Builds a minimal Express `Request` stub via `asStub`. Simulates `req.is(type)` so it returns the matched type, `false`, or `null` (no body) depending on the supplied `contentType`. This is how tests control the transport path without a real HTTP server.
- **`makeResponse()`** — Returns a stub `Response` plus a `sent` bag capturing `status` and `json` calls, for exercising `rejectResponse` paths.
- **`describe('readInput') → 'precedence'`** — Verifies the per-surface winner (`search`→body, `write`→params, `delete`→params, `path`→params), fallback when the higher source is absent, key-union across sources, source visibility (`path` sees only params), explicit-`undefined` key removal, body-less requests, and the "no pagination default" rule.
- **`describe('readInput') → 'ids'`** — Covers first-source-wins resolution, empty-string fall-through, array-valued keys (takes first entry), and absent-key omission.
- **`describe('readInput') → 'transport decoding'`** — Multipart-only coercion: booleans, string arrays, numbers (including the `''`→string and unparseable-string pass-through). Explicitly asserts that JSON bodies are **not** type-coerced.

## Relationships

- **`src/infrastructure/http/request.ts`** — The module under test. `readInput`, `callerContextOf`, `extractAndValidateId`, and `isValidObjectId` are imported and exercised here.
- **`tests/support/stub.ts`** — Provides `asStub<T>`, the generic helper used to construct the `Request` and `Response` stand-ins without pulling in a full Express instance.

## Notes

- **Express 5 body quirk:** When a request carries no body, Express 5 leaves `req.body` as `undefined` (Express 4 gave `{}`). `makeRequest` mirrors this by defaulting `body` to `undefined`, not `{}`. Tests for body-less requests (e.g., `DELETE /cart/:productId`) exist specifically to guard against a `TypeError` that would surface only in production.
- **Multipart type coercion is transport-conditional.** The test file asserts that JSON bodies are left untouched so downstream validators (Zod) can reject type mismatches with their own messages. Coercion applies only when `req.is('multipart/form-data')` is truthy.
- **Empty string ≠ zero for numbers.** `Number('')` is `0`, but the code deliberately leaves `''` as a string so the validator can distinguish "not sent" from a legitimately free (zero-priced) product.
- **No pagination defaults here.** Absent `page`/`pageSize` must surface as `undefined`; defaults and bounds live in `normalizePagination` (`@infrastructure/persistence/search`), tested separately.
- **Precedence is per-surface, not per-call.** The `it.each` table pins all four surfaces at once so a precedence inversion is caught in a single failing row rather than hiding behind which array a controller happened to pass.
