---
source: src/infrastructure/http/middlewares/idempotency-model.ts
sha256: 6cbf65bac53e83642328db9d754cd03b0d31f03909db81048174c336b75a4bd6
generated_at: 2026-11-08T03:30:47.214418+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency-model.ts

## Purpose

Defines the Mongoose schema and model for the idempotency ledger — one document per `(key, caller)` pair that records a retried write's fingerprint and, once the handler has answered, its full outcome (status, body, `Location`, `Content-Type`, selected headers). It lives in infrastructure rather than a domain module because it belongs to no domain; the same exception as `rate-limit.ts`'s store.

## Key elements

- **`IDEMPOTENCY_RECORD_STATES`** — `['in_flight', 'done']` const tuple; the single source of truth for the schema's `enum`.
- **`IdempotencyRecordState`** — exported type derived from the tuple above.
- **`IdempotencyRecordDocument`** — the document interface: `key`, `caller`, `fingerprint`, `state`, and optional `status`, `body`, `location`, `contentType`, `headers`, plus Mongoose `timestamps`.
- **`IdempotencyRecordModel`** — `Model<IdempotencyRecordDocument>` type alias.
- **`idempotencyRecordSchema`** — the Mongoose schema. `body` and `headers` use `Schema.Types.Mixed` (shape varies per route / header names are a fixed string map). `state` defaults to `'in_flight'`.
- **Unique index `idempotency_key_caller_unique`** on `{key, caller}` — acts as the distributed lock; `idempotency.ts` interprets the E11000 duplicate-key error as "another caller already holds this key," never as a surfaceable DB error.
- **TTL index `idempotency_createdAt_ttl`** on `createdAt` — `expireAfterSeconds` is computed from `idempotencyConfig().NODE_IDEMPOTENCY_RETENTION_HOURS × HOUR_SECONDS` (default 24 h).
- **`idempotencyRecordModel`** — the exported Mongoose model (collection `idempotencyrecords`); the sole entry point consumers import.

## Relationships

- **`src/infrastructure/http/config.ts`** — reads `idempotencyConfig()` at import time to resolve the retention-hours value baked into the TTL index.
- **`src/domain-primitives/time.ts`** — imports `HOUR_SECONDS` for the TTL computation.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — the middleware that performs the insert (lock acquisition) and later `updateOne`/`findOne` calls against this model; the three-way branch (in-flight / replay / mismatch) keys off the `state` field defined here.
- **`tests/unit/infrastructure/http/middlewares/idempotency.test.ts`** & **`…/idempotency-retention.test.ts`** — unit tests exercising the schema shape, state transitions, and retention behavior.
- **`tests/contract/idempotency.test.ts`** & **`tests/integration/idempotency-server-fault.test.ts`** — contract/integration tests that drive the full insert → answer → replay flow through this collection.

## Notes

- **TTL changes require `npm run db:sync`.** Mongo will not modify an existing index's `expireAfterSeconds` in place; a restart after changing `NODE_IDEMPOTENCY_RETENTION_HOURS` fails boot. `db:sync` drops and rebuilds the index.
- **The unique index *is* the lock.** `idempotency.ts` treats the E11000 duplicate-key error as a control-flow signal (fall into the in-flight / replay / mismatch branch), not as a database error to surface to the caller.
- **`body` and `headers` are `Mixed`.** `body` shape varies per route; `headers` is a flat `Record<string, string>` whose keys come from a fixed list (`Retry-After`, `WWW-Authenticate`, `Allow`). Do not add structured sub-schemas without coordinating with `idempotency.ts`.
- **Infrastructure-owned by design.** Despite living under `middlewares/`, it is not owned by any domain module — the same deliberate exception as `rate-limit.ts`'s store.
