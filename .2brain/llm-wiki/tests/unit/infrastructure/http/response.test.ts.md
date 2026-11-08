---
source: tests/unit/infrastructure/http/response.test.ts
sha256: 139cccb8855eae720dbc1577453a6d3d7a3476f8da93e0ce227515315a615377
generated_at: 2026-11-08T10:18:13.821963+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/response.test.ts

## Purpose

Unit tests for the API response envelope module. They pin the public contract every endpoint must follow: the shape of success vs. reject responses, the status→code mapping, the i18n behaviour of error messages, and the normalisation rules that guarantee `errors` is never empty on a failure.

## Key elements

- **`describe('generateSuccess')`** — Asserts that `generateSuccess` returns data unchanged (no Mongo normalisation), defaults to 200, honours an explicit status, omits the `errors` key at runtime, and preserves an `undefined` `data` key.
- **`describe('generateReject')`** — The bulk of the file. Verifies structured error-item construction, default status (400), synthesised fallback items, and the normalisation of mixed string/structured error arrays.
- **`codeFor(status)`** (local helper) — Calls `generateReject(status, ['y'])` and extracts `errors[0].code`; used by every code-assertion test.
- **`it.each` status→title table** — 17 statuses pinned to their exact English `message` string (RFC 9110 phrasing, plus 418 and the two catch-alls 499/599).
- **`it.each` status→i18n key table** — Confirms each fallback error item is resolved through `t('generic.error-*')` in the active language; a separate Italian `translator('it')` check proves translations differ from English.
- **`it.each` status→code table** — Asserts UPPER_SNAKE(RFC 9110 name) for each catalogued status, that `ERROR_CODES` contains the key, and that every code has a matching locale key.
- **Catch-all code rules** — 5xx ≠ 503 collapses to `INTERNAL_SERVER_ERROR`; uncatalogued 4xx (418, 410) → `CLIENT_ERROR`; 499 explicitly client-side (guards the `>= 500` boundary).
- **Normalisation edge cases** — Empty-string `code` or `message` on a structured item is filled from the status; `details: undefined` is omitted from the serialised object.

## Relationships

- **`src/infrastructure/http/response.ts`** — Module under test. Every public function (`generateSuccess`, `generateReject`, `resolveErrorTitle`, `fieldError`, `successResponse`, `createdOrOk`, `noContentResponse`, `rejectResponse`) is imported and exercised.
- **`src/infrastructure/i18n/context.ts` / `index.ts`** — Supply `t()` and `translator()` used to assert that fallback error messages are locale-resolved and that Italian output differs from English.
- **`tests/support/express.ts`** — Provides `makeResponseStub`, the chainable `res.status().json()` mock used by the Express-level response helpers (`successResponse`, `createdOrOk`, `noContentResponse`, `rejectResponse`) tested in the (truncated) lower portion of the file.

## Notes

- The file also imports `ERROR_CODES` from `@api/error-codes` (not listed in the graph) to cross-check that every derived code is a registered catalogue entry.
- The `it.each` tables are intentionally exhaustive: the file comments call partial coverage "worse than none" because an unasserted status leaves a client-facing wording unread.
- `errors` key is asserted absent from successful responses via `Object.keys`, not just `expect(response.errors).toBeUndefined()` — the concern is the key *existing* with an `undefined` value in JSON output.
- The `code: '' as ErrorCode` and `message: ''` test cases deliberately use falsy-but-typed values to exercise the `||` fallback branch that the type system does not prevent.
