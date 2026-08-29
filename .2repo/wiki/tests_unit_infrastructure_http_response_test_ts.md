# tests/unit/infrastructure/http/response.test.ts

## Purpose

Unit tests for the API response-envelope helpers in `src/infrastructure/http/response.ts`. They pin the public contract every endpoint answers in: the shape of success/reject bodies, the status→`code` mapping, the status→`message` wording, and the Express-send wrappers. The file exists because the envelope is the API's dialect, not an implementation detail, and a well-meaning refactor could silently drop guarantees (e.g. an empty `errors` array, a leaked 5xx sub-code) without any caller noticing.

## Key elements

- **`codeFor(status)`** — local helper that calls `generateReject(status, ['y'])` and returns `errors[0].code`; used throughout the reject tests to assert the stable code for a given status.
- **`describe('generateSuccess')`** — verifies the success envelope: `success: true`, `status` defaults to 200, `message` defaults to `''`, `data` passes through untouched (including primitives and `undefined`), and the runtime object has no `errors` key.
- **`describe('generateReject')`** — the largest block. Covers: string→item normalisation, structured-item preservation, default status 400, synthesised item when no errors supplied, the full status→message table (via `it.each`), `code` stability per status, 5xx collapse to `INTERNAL_ERROR`, 499 boundary, unmapped-4xx fallback to `REQUEST_ERROR`, mixed string/structured arrays, empty `code`/`message` backfill, `details` key omission, and the always-present `data: undefined` key.
- **`describe('successResponse')`** — asserts the Express wrapper writes the same status to both `res.status()` and the body, and defaults to 200.
- **`describe('rejectResponse')`** — same dual-write assertion for rejects, default 400, and a guard that the function does not throw (callers must `return` it).
- **`makeResponseStub`** (from `@tests/express`) — a chainable `res.status().json()` stub used by the two Express-wrapper describe blocks.

## Relationships

- **`src/infrastructure/http/response.ts`** — the module under test. All five exported functions (`generateSuccess`, `generateReject`, `resolveErrorMessage`, `successResponse`, `rejectResponse`) are imported and exercised.
- **`tests/support/express.ts`** — provides `makeResponseStub`, the minimal Express `Response` mock that records `.status()` and `.json()` calls; used only by the `successResponse` and `rejectResponse` test blocks.

## Notes

- The `it.each` table for status→message is the single source of truth for wording; `resolveErrorMessage` is cross-asserted in the same row, so a divergence between the two functions fails immediately.
- The 499 vs 500 boundary is tested explicitly (`codeFor(499)` → `REQUEST_ERROR`, `codeFor(500)` → `INTERNAL_ERROR`). The comment notes that a `> 500` comparison would silently misclassify a bare 500.
- `details` is asserted absent (not `undefined`) when not supplied, because some serialisers emit `"details": null` which would trip contract validation.
- `rejectResponse` is tested to *not* throw; the contract is that it sets headers/body and the caller's `return` halts execution. Forgetting the `return` is a caller bug, not something the helper can prevent.
