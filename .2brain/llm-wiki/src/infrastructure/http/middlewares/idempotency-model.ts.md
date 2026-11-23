---
source: src/infrastructure/http/middlewares/idempotency-model.ts
source_sha256: 7d0d9987c712ae039b85ac5a07ee85d8a5ca8b607ed6d29f0c2df08bdffce7ae
context_sha256: 687de506cba54bd92a4633405499d489b4a95634e15eecc4bd9640df4c92e398
generated_at: 2026-11-22T02:49:44.999245+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/idempotency-model.ts

## Purpose
Defines the Mongoose schema and model for the idempotency ledger: one document per `(key, caller)` that stores a retried write's fingerprint and, once the guarded handler has answered, its outcome (status, body, replayable headers). The read/write flow built on it lives in `idempotency.ts`. It is infrastructure-owned rather than a module's, the same exception `rate-limit.ts`'s store is under, because the collection belongs to no domain.

## Key elements
- `IdempotencyRecordState`: type derived from `IDEMPOTENCY_RECORD_STATES` (`'in_flight' | 'done'`), also used as the schema `enum`.
- `IdempotencyRecordDocument`: document interface with `key`, `caller`, `fingerprint`, `state`, and optional `status`, `body`, `location`, `contentType`, `headers`, `createdAt` and `updatedAt`. The response fields are absent until the handler answers.
- `IdempotencyRecordModel`: `Model<IdempotencyRecordDocument>` type.
- `idempotencyRecordModel`: the exported model, registered as `IdempotencyRecord` (collection `idempotencyrecords`).
- Unique index `idempotency_key_caller_unique` on `{ key, caller }`: acts as the lock.
- TTL index `idempotency_createdAt_ttl` on `createdAt`: expires records after `retentionHours * HOUR_SECONDS`.

## Relationships
- `@infrastructure/http/config`: `idempotencyConfig().NODE_IDEMPOTENCY_RETENTION_HOURS` supplies the retention window.
- `@domain-primitives/time`: `HOUR_SECONDS` converts hours to the TTL's seconds.
- `idempotency.ts`: the middleware that consumes this model. It treats an E11000 collision on the unique index as the signal to branch into in-flight, replay or mismatch handling, not as an error to surface. It also branches on `state`.
- The listed unit, integration and contract tests for idempotency (including `outcome-unknown.test.ts`) are neighbors of this file in the dependency graph.

## Notes
- The retention window is read once at import time. Changing `NODE_IDEMPOTENCY_RETENTION_HOURS` and restarting fails the boot, because Mongo will not change an existing TTL index's `expireAfterSeconds` in place. Run `npm run db:sync` to drop and rebuild the index.
- `state` defaults to `'in_flight'`.
- `body` and `headers` use `Schema.Types.Mixed`. `body` varies per route. `headers` is a flat name-to-value map drawn from a fixed list (`Retry-After`, `WWW-Authenticate`, `Allow`).
- `location` and `contentType` are stored so a replay looks like the original response. `contentType` is absent when Express's JSON default applied.
- Records are a retry ledger, not a durable record of the write. Retention is meant to outlast client retry backoff.
