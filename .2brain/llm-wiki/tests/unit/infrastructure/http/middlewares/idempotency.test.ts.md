---
source: tests/unit/infrastructure/http/middlewares/idempotency.test.ts
sha256: d42730312ed6e1ba03fcab473962ecb0684be25629d5c326c8d69c0b2a6e3ee4
generated_at: 2026-10-15T13:12:25.849149+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/idempotency.test.ts

## Purpose

Unit-tests the fingerprint logic of `idempotencyKey` (the public entry point of the idempotency middleware). It asserts that logically-equal request bodies produce the same fingerprint and different ones do not, while the idempotency model is fully mocked so no database is required. Real-database outcomes (409, 422 replay, TTL expiry) are delegated to a separate contract test.

## Key elements

- **`flush`** – one-line helper (`setImmediate`-based) that lets the middleware's internal promise chain settle before assertions run.
- **`makeRequest`** – builds a minimal Express `Request` stub (via `asStub`) carrying only the fields `idempotencyKey` reads: `header`, `method`, `path`, `route.path`, `body`, `ip`.
- **`fingerprintOfFirstClaim`** – issues one claim and returns the `fingerprint` string passed to the mocked `create`.
- **`collideWithInFlight`** – pre-configures `create` to reject with E11000 and `findOne` to return an in-flight record of a given age, simulating a duplicate-key collision.
- **`describe('idempotencyKey')`** – the test suite. Notable cases:
  - Key-order invariance (top-level and nested objects).
  - Value sensitivity (different value → different fingerprint).
  - Fingerprint is *not* a bare SHA-256 of the body (security: passwords not guessable from a dump).
  - Different resource paths under one route template produce different fingerprints.
  - No key → `next()` called, ledger untouched.
  - Illegal key → 422 before any ledger access.
  - `__proto__` key (top-level, nested, in array) → 422, rejected before fingerprinting.
  - Proto-*like* keys (`protoype`, `__proto_`) pass through normally.
  - Replay-lookup failure after collision → answered via `next(error)` (no unhandled rejection).
  - Vanished-record retry: create is retried exactly once; second vanish gives up and proceeds uncaptured.
  - In-flight record → 409.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency.ts`** – System under test. The file imports `idempotencyKey` and `requireIdempotencyKey` and drives them with stub requests/responses.
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** – Mocked via `jest.mock`. The test inspects the arguments passed to `idempotencyRecordModel.create` to read the computed fingerprint.
- **`tests/support/express.ts`** – Supplies `makeResponseStub`, used to capture and assert on `status`/`json` calls the middleware makes.
- **`tests/support/stub.ts`** – Supplies `asStub`, used by `makeRequest` to produce a type-correct minimal `Request` object without a full Express app.

## Notes

- The `__proto__` rejection tests build the body with `JSON.parse(jsonString)` rather than an object literal. A literal's `{ "__proto__": … }` silently sets the prototype; only a parsed string creates a genuine own `__proto__` key, which is the case `canonicalize` must handle.
- The fingerprint format is asserted to match `/^[\da-f]{64}$/` (SHA-256 hex), but the test explicitly verifies it is *not* the bare `sha256("METHOD /path\n" + JSON.stringify(body))` — the middleware applies its own canonicalization (recursive key sort, `__proto__` stripping) before hashing.
- The retry-on-vanished-record test exists to prevent both an infinite retry loop and an unhandled promise rejection that would hang the client until its own timeout.
- This file deliberately stops at the model boundary; it does not exercise MongoDB semantics, TTL, or connection-level failure modes.
