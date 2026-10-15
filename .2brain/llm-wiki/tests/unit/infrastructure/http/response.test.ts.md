---
source: tests/unit/infrastructure/http/response.test.ts
sha256: 28c064c8d36015dde2b0cbe32c95657ee71e20bb3a87d456630214b495217b21
generated_at: 2026-10-15T13:15:43.884386+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/response.test.ts

## Purpose

Unit tests for the response-envelope module (`src/infrastructure/http/response.ts`). The file pins the API's public dialect — the exact shape of success and reject payloads, the status→`code` mapping, and the error-normalisation rules — because those contracts are what every client branches on. The tests are deliberately exhaustive over status codes and edge cases so that no "well-meaning simplification" can silently drop a guarantee (e.g. empty `errors` array, missing `data` key, or a 5xx leaking a specific status code).

## Key elements

- **`generateSuccess` tests** — verify plain-object passthrough (no implicit Mongo normalisation), primitive data, default `200`/`''`, explicit status/message, absence of a runtime `errors` key, and preservation of `undefined` data.
- **`generateReject` tests** — the bulk of the file. Asserts:
  - String errors are wrapped into `{ code, message }` items; structured items pass through untouched.
  - Default status is `400` (safer than `500` for an unannotated reject).
  - An empty `errors` array is replaced with a synthesised item (never empty on failure).
  - Per-status `message` wording is identical regardless of caller-supplied errors.
  - Per-status `code` mapping (400→`BAD_REQUEST`, 401→`UNAUTHORIZED`, …) and two catch-alls: unmapped 4xx → `REQUEST_ERROR`, all 5xx → `INTERNAL_ERROR`.
  - `data` key is always present (value `undefined`).
  - Mixed string + structured error arrays normalise correctly.
  - Falsy `code`/`message` on a structured item are filled from the status.
  - `details` key is omitted (not serialised as `undefined`) when absent, retained when present.
- **`successResponse` tests** — confirm the HTTP status is written to both the response header and the body (intentional duplication to prevent disagreement).
- **`createdOrOk` tests** — 201 path calls `Location` header; 200 path does not.
- **Helpers** — `codeFor(status)` extracts the mapped code from a reject; `stubWithLocation()` extends `makeResponseStub` with a mockable `location()` for the 201 test.

## Relationships

- **`src/infrastructure/http/response.ts`** — the module under test. All exported helpers (`fieldError`, `generateReject`, `generateSuccess`, `resolveErrorMessage`, `successResponse`, `createdOrOk`, `rejectResponse`) are imported and exercised here.
- **`tests/support/express.ts`** — provides `makeResponseStub()`, a chainable Express `res` mock (`status().json()`) used by `successResponse` and `createdOrOk` tests.

## Notes

- `errors: never` on the success type exists **only** for TS narrowing; the tests assert the key is *absent* at runtime (`Object.keys` check). Emitting it would put a stray field on every 200 response.
- The `data` key is asserted present-but-`undefined` on rejects so that `result.data` type-checks on both union branches; omitting it would break client code that unconditionally reads `.data`.
- The 499 vs 500 boundary is explicitly tested: `499` maps to `REQUEST_ERROR` (client error), `500+` maps to `INTERNAL_ERROR`. A `> 500` check instead of `>= 500` would silently misclassify a bare 500.
- `resolveErrorMessage(status)` is cross-checked against `generateReject(status).message` in every status case to keep the two in lockstep.
- The truncated tail likely contains additional tests for `rejectResponse` and `fieldError`, which are imported but whose describe blocks were cut off.
