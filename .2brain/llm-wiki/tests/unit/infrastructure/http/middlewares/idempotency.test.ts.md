---
source: tests/unit/infrastructure/http/middlewares/idempotency.test.ts
sha256: 57503fcb790b21f7e99edab7c7ea80247324400d58ad3fe148cace11829dca3c
generated_at: 2026-11-08T10:14:05.569107+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/idempotency.test.ts

## Purpose

Unit tests for the `idempotencyKey` middleware's fingerprinting and key-validation logic. The tests assert that the fingerprint is order-independent (including nested objects), path-sensitive, not a bare body hash, and that invalid or hostile inputs are rejected before any ledger write. Real-database outcomes (409/422/replay) are delegated to `tests/contract/idempotency.test.ts`.

## Key elements

- **`idempotencyRecordModel` (mocked)** — `create`, `updateOne`, and `findOne` are jest-mocked so no database is needed; the middleware's model calls are its "public door" for assertions.
- **`makeRequest(key, body, path)`** — builds a minimal Express `Request` stub carrying only the fields `idempotencyKey` reads (header, method, path, route, body, ip).
- **`flush()`** — yields one `setImmediate` tick so the middleware's promise chain (e.g. `create().then(...)`) settles before assertions run.
- **`fingerprintOfFirstClaim()`** — runs `idempotencyKey` with a known key/body and returns the `fingerprint` stored in the first `create` call.
- **`collideWithInFlight(fingerprint, ageMs)`** — simulates an E11000 insert failure followed by a `findOne` returning an `in_flight` record last touched `ageMs` ago.
- **Test blocks** — cover: top-level and nested key-order invariance; value-change sensitivity; non-bare-hash (password non-guessability); per-resource path discrimination; no-op on missing key; 422 on malformed key; `__proto__` rejection (top-level, nested, array-element) vs. proto-like keys (`__proto_`, `protoype`); error propagation on failed replay lookup; single-retry on vanished record; in-flight 409 / 422 timeout / replay outcomes.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency.ts`** — the module under test; exports `idempotencyKey` and `requireIdempotencyKey`.
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — mocked via `jest.mock` so the tests exercise the middleware's call shape without a database.
- **`src/infrastructure/adapters/logger.ts`** — imported (the middleware logs internally); not directly asserted in these tests.
- **`tests/support/express.ts`** — provides `makeResponseStub` used to capture `status`/`json` calls.
- **`tests/support/stub.ts`** — provides `asStub<Request>` for building the request fixture.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — shares the same support helpers; no direct import from this file.

## Notes

- The `__proto__` test fixtures are built via `JSON.parse` of a string, not object literals, because a literal `{ __proto__: ... }` sets the prototype chain rather than creating an own key — matching how Express's body parser actually produces `request.body`.
- `flush()` is called once per awaited middleware step; collision/lookup paths require two flushes (create-reject → findOne). The "vanished record" retry tests need up to three flushes.
- The fingerprint is expected to match `/^[\da-f]{64}$/` (a SHA-256 hex string) but must *not* equal the bare `sha256(method + path + JSON.stringify(body))` — confirming a keyed or salted derivation.
- `requireIdempotencyKey` is imported but the visible test content focuses entirely on `idempotencyKey`; any `requireIdempotencyKey` tests would appear after the truncation point.
