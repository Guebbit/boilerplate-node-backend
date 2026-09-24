---
source: tests/unit/infrastructure/http/middlewares/idempotency.test.ts
sha256: c9bcf941e2bf5629d8cf4c2c15538a0582d7fe57700cad88a3129f002c108176
generated_at: 2026-09-23T20:21:12.755721+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/idempotency.test.ts

## Purpose

Unit tests for the `idempotencyKey` middleware's body-fingerprint (canonicalization) logic. Verifies that logically-equal request bodies produce the same fingerprint and different bodies do not, exercised through the middleware's public call with the database model fully mocked. Real-database outcomes (409 conflict, 422 rejection, replay delivery) are intentionally left to the contract test suite.

## Key elements

- **`makeRequest(key, body)`** — builds a minimal Express `Request` stub (via `asStub`) carrying only the fields `idempotencyKey` reads: `header()`, `method`, `baseUrl`, `path`, `route`, `body`, `ip`.
- **`flush()`** — resolves on `setImmediate` so pending `.then()` chains inside the middleware settle before assertions run.
- **`jest.mock` of `idempotencyRecordModel`** — stubs `create`, `updateOne`, and `findOne` with jest fns; tests cast `create`/`findOne` to `jest.Mock` for call inspection.
- **Fingerprint-invariance tests** — assert identical fingerprint for reordered top-level and nested keys; assert *different* fingerprint when a value changes.
- **No-key passthrough** — with no `Idempotency-Key` header, `next()` is called immediately and `create` is never invoked.
- **Invalid-key rejection** — malformed keys trigger a 422 `VALIDATION_ERROR` response without touching the ledger.
- **`__proto__` rejection tests** (parameterised ×3) — bodies with an *own* `__proto__` key (top-level, nested, inside array) are refused with 422 before any DB call.
- **Proto-like key acceptance** — keys such as `protoype` or `__proto_` pass through and produce a fingerprint normally.
- **Replay-lookup failure test** — after an E11000 collision, if the subsequent `findOne` rejects, the error is forwarded via `next(error)` (not left unhandled).
- **Vanished-record retry tests** — E11000 → lookup returns `null` → one retry of `create` succeeds; if the retry also gets E11000 and lookup is `null` again, the middleware gives up after exactly one retry and calls `next()` uncaptured.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency.ts`** — system under test; `idempotencyKey` is imported and invoked directly in every test case.
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — the only external dependency, fully mocked via `jest.mock`; tests assert on the arguments passed to its `create` and `findOne` calls.
- **`tests/support/express.ts`** — supplies `makeResponseStub` used to capture `status()`/`json()` calls in rejection-path tests.
- **`tests/support/stub.ts`** — supplies `asStub` (a type-narrowing helper) used by `makeRequest` to satisfy the Express `Request` type.

## Notes

- The `__proto__` fixtures are built with `JSON.parse(jsonString)` rather than object literals. An object literal's `__proto__:` writes to the prototype slot, not as an own key; only a parsed JSON string reproduces the own-key scenario that `canonicalize` is designed to detect.
- The file deliberately does **not** assert HTTP status codes for the 409/replay happy paths — those belong to the contract test (`tests/contract/idempotency.test.ts`). This file only checks the fingerprint bytes and the guard-clause rejections.
- The retry logic is capped at exactly one re-`create` after an E11000. The "gives up" test asserts `create` is called exactly 2 times total and `next()` is still invoked, preventing an infinite retry loop.
- `flush()` must be awaited the correct number of times per test (once per promise chain tick) — under-flushing leads to assertions running before the middleware's internal `.then()` has resolved.
