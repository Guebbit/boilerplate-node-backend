---
source: tests/unit/infrastructure/http/middlewares/idempotency.test.ts
sha256: 67f5bb63839350bed0318f2a91f050926ef9564f197e6eb237f49362c62b9125
generated_at: 2026-09-27T16:06:49.098922+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/idempotency.test.ts

## Purpose

Unit tests for the `idempotencyKey` middleware's fingerprint computation and its collision/retry logic. The goal is to verify that two logically-equal request bodies always produce the same fingerprint (and different bodies do not), plus to exercise the edge cases around key validation, `__proto__` rejection, and the in-flight/vanished-record branches — all without a real database, by mocking `idempotencyRecordModel`.

## Key elements

- **`flush`** — `setImmediate`-based helper that lets the mocked `create().then(...)` promise chain settle before assertions run.
- **`makeRequest(key, body, path)`** — builds a minimal Express `Request` stub (via `asStub`) carrying only the fields `idempotencyKey` reads: header, method, path, route, body, ip.
- **`fingerprintOfFirstClaim`** — fires one `idempotencyKey` call, flushes, and reads the `fingerprint` field from the first `create` call. Used to seed collision scenarios.
- **`collideWithInFlight(fingerprint, ageMs)`** — pre-configures `create` to reject with E11000 and `findOne` to return an `in-flight` record with the given age, so subsequent tests can hit the 409 / takeover branches.
- **`describe('idempotencyKey')`** — the test suite. Cases cover: key-order invariance (top-level and nested), value sensitivity, per-resource differentiation via route path, no-key no-op, invalid-key 422, `__proto__` rejection (top-level, nested, array-element), proto-like keys passing, replay-lookup failure → `next(error)`, vanished-record single retry, give-up after one retry, in-flight 409, stale in-flight takeover.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency.ts`** — the system under test; imports `idempotencyKey`.
- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — mocked at the module level; provides `idempotencyRecordModel.create`, `.updateOne`, `.findOne` as jest fns.
- **`tests/support/express.ts`** — provides `makeResponseStub` used in every test that inspects status codes or JSON bodies.
- **`tests/support/stub.ts`** — provides `asStub`, used by `makeRequest` to type-cast a plain object as an Express `Request`.

## Notes

- The `__proto__` fixtures are built with `JSON.parse` rather than object literals so that `__proto__` becomes an *own* enumerable key (which is what a real body-parser would produce). A literal `{ __proto__: … }` would set the prototype instead and would not trigger the guard.
- Collision retry is bounded to **exactly one** retry: a second vanished lookup calls `next()` uncaptured rather than looping. Tests assert `create` was called twice, not three.
- The fingerprint incorporates the concrete route path (`/widgets/a` vs `/widgets/b`), not the template, so two different resources behind the same route pattern are not collapsed into one fingerprint.
- Real-database behaviour (actual 409/422/replay outcomes against a live collection) is delegated to a separate contract test; this file stays pure-unit by mocking the model layer.
