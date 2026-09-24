---
source: tests/unit/infrastructure/http/response.test.ts
sha256: 12ae3a3ba0d5563b6af75957e58a28f4f3898259714207e1585c3428af6562f6
generated_at: 2026-09-23T20:23:15.167101+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/response.test.ts

## Purpose

Unit tests for the response-envelope helpers in `src/infrastructure/http/response.ts`. They pin the public API contract: the shape of success/reject payloads, the status-to-code mapping, the guarantee that `errors` is never empty on a failure, and the "status written twice" convention that keeps the HTTP status and body status in lockstep.

## Key elements

- **`generateSuccess` tests** — Verify the success payload shape: `data` passthrough (including `undefined`, primitives, and Mongo-style objects), default 200 / `''` message, explicit status+message override, and that `errors` is absent from the runtime object.
- **`generateReject` tests** — Verify the reject payload shape: structured error-item construction from plain strings, preservation of caller-supplied items, default 400, synthesis of a fallback item when `errors` is empty, mixed string/structured normalization, and filling missing `code`/`message` fields from the envelope.
- **`codeFor` helper** — Local utility that extracts `errors[0].code` for a given status; used to assert the status→code map (400→`BAD_REQUEST`, 404→`NOT_FOUND`, all 5xx→`INTERNAL_ERROR`, unmapped 4xx→`REQUEST_ERROR`, 499→`REQUEST_ERROR`).
- **`resolveErrorMessage` tests** — Assert that every mapped status (and the two catch-all buckets) produces the same canonical message string, independent of caller-supplied errors.
- **`details` omission tests** — Confirm that a `details` key is absent (not `undefined`) when not provided, preventing serializer artefacts.
- **`successResponse` / `rejectResponse` tests** — Verify the Express-level helpers call `res.status(code)` and `res.json(body)` with matching status, and that `rejectResponse` never throws (so a forgotten `return` is the developer's bug, not a silent crash).

## Relationships

- **`src/infrastructure/http/response.ts`** — The module under test. This file imports `generateSuccess`, `generateReject`, `resolveErrorMessage`, `successResponse`, and `rejectResponse`, and asserts their full behavioral contract.
- **`tests/support/express.ts`** — Provides `makeResponseStub`, a chainable mock of `Express.Response` (`.status()` and `.json()` as jest spies) used by the `successResponse` and `rejectResponse` describe blocks.

## Notes

- The `errors` array is guaranteed non-empty on every reject; tests assert this from multiple angles (no-errors call, mixed list, single string) so a refactoring that drops the fallback synthesis will fail.
- The status→code map is exhaustive: every mapped status is asserted individually, and the two catch-alls (`>=500` → `INTERNAL_ERROR`, other 4xx → `REQUEST_ERROR`) are tested with boundary values (499, 500, 599). Partial coverage is explicitly flagged as a risk in inline comments.
- `details` must be _absent_, not `undefined`, because some JSON serializers emit `"details": null` which breaks contract validation.
- `rejectResponse` is documented as non-throwing; controllers are expected to `return` it. A test pins this so the contract cannot silently change.
