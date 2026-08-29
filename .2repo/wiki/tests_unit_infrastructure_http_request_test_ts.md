# tests/unit/infrastructure/http/request.test.ts

## Purpose

Unit tests for `readInput` and its companion helpers (`extractAndValidateId`, `isValidObjectId`, `callerContextOf`) from `@infrastructure/http/request`. The file exists because `readInput` is a small function reached by every controller yet exercised by integration/contract suites only incidentally; these tests pin down each rule the declaration encodes—precedence, undefined-key handling, transport-specific decoding, and the express-5 no-body edge case—so a regression surfaces here rather than in a 500 on `DELETE /cart/:productId`.

## Key elements

- **`makeRequest(overrides)`** — Builds a minimal `express.Request` stub (via `asStub`) with `params`, `body`, `query`, and a `content-type`-aware `is()` method that mirrors express semantics (returns the matched type, `false`, or `null` for absent body).
- **`makeResponse()`** — Returns a stub `express.Response` plus a `sent` capture object for asserting `status`/`json` calls (used by `rejectResponse` paths).
- **`describe('readInput') > 'precedence'`** — Verifies which source wins per surface (`search→body`, `write→params`, `delete→params`, `path→params`), fallback when the higher source is absent, source isolation, undefined-key dropping, and the no-body-at-all path.
- **`describe('readInput') > 'ids'`** — Covers ObjectId extraction: first-source-wins, body fallback, empty-string fall-through, array-to-first-entry, and absence.
- **`describe('readInput') > 'transport decoding'`** — Multipart-only coercion of booleans, string arrays, and numbers; guards against coercing JSON values or blank strings to `0`.
- **`OBJECT_ID`**, **`JSON_TYPE`**, **`FORM_TYPE`** — Shared test constants.

## Relationships

- **`src/infrastructure/http/request.ts`** — The unit under test. All `describe` blocks exercise `readInput`, `extractAndValidateId`, `isValidObjectId`, and `callerContextOf` imported from this module.
- **`tests/support/stub.ts`** — Provides `asStub`, the typed `jest.fn()` wrapper used to construct the `Request` and `Response` fakes without pulling in the full express runtime.

## Notes

- **Express 5 vs 4 body default:** Express 5 sets `request.body` to `undefined` (not `{}`) when no body is present. The no-body tests (`survives a request with no body at all`, `reads the route param when the request has no body at all`) exist specifically to catch the crash that would result from dereferencing `undefined`.
- **Undefined-key / Mongoose interaction:** A spread like `{ text: undefined }` creates a key with value `undefined`; Mongoose interprets `field: undefined` as an active filter clause. The dedicated test asserts `readInput` strips such keys so downstream query builders see them as absent.
- **Multipart number coercion is intentionally lossy:** `Number('')` is `0`, but an empty form field means "not sent" and `0` is a legal price. The test pins that blank strings pass through unchanged rather than being coerced, so the validator downstream can reject with the contract's own message.
- **Pagination defaults are out of scope here:** `readInput` reports absent pagination as `undefined`; the 1–100 bounds and `NODE_SETTINGS_PAGINATION_PAGE_SIZE` fallback live in `normalizePagination` (`@infrastructure/persistence/search`) and are tested in `tests/unit/repositories/search-pagination.test.ts`.
