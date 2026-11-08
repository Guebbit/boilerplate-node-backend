---
source: tests/unit/infrastructure/http/middlewares/idempotency-retention.test.ts
sha256: 04a1ab3de09a37d904a82b208f33607d99abeee3f9706cedec252e8f8f818efb
generated_at: 2026-11-08T10:13:51.919052+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/idempotency-retention.test.ts

## Purpose

Unit test that verifies the idempotency ledger retains keys for exactly 24 hours. It exists to lock in the TTL contract that retrying clients depend on: a request retried a day later must still be replayed (idempotent) rather than treated as a fresh write.

## Key elements

- **`describe('the idempotency ledger retention')`** — top-level suite; no setup/teardown hooks.
- **`it('remembers a key for 24 hours by default')`** — single assertion. Walks the Mongoose schema's registered indexes (`idempotencyRecordModel.schema.indexes()`), locates the one with a non-undefined `expireAfterSeconds`, and asserts it equals `24 * 60 * 60` (86 400 s).

## Relationships

- **`src/infrastructure/http/middlewares/idempotency-model.ts`** — the sole import target. Provides `idempotencyRecordModel`, a Mongoose model whose schema definition (specifically its TTL index) is the unit under test. The test has no other collaborators.

## Notes

- The test introspects the compiled Mongoose schema rather than reading a named constant, so the assertion will still pass if the retention is redefined as a different expression that evaluates to 86 400, but will break silently if the TTL index is removed or renamed (the `find` simply returns `undefined` and `ttl?.[1]` is `undefined`, causing the `toBe` to fail).
- `24 * 60 * 60` is written inline; there is no shared `RETENTION_SECONDS` export to cross-reference. If the production constant changes, this test must be updated in lockstep.
- Only one test case exists — there is no coverage for edge cases (e.g., a custom TTL override or a missing index).
