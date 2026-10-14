---
source: src/infrastructure/http/middlewares/idempotency-model.ts
sha256: 856499644f9f3a6e14b384137e89f7ed0e9831119655d44fded31f03c5dc73a7
generated_at: 2026-10-14T07:56:11.467057+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency-model.ts

## Purpose

Defines the Mongoose schema, indexes, and model for the idempotency ledger — a Mongo collection that stores one record per `(key, caller)` pair, capturing a retried write's request fingerprint and, once the handler has responded, its status/body. It exists so that `idempotency.ts` can deduplicate in-flight requests and replay cached outcomes without re-executing side effects.

## Key elements

- **`IDEMPOTENCY_RECORD_STATES`** — `['in-flight', 'done']` const array; the single source of truth for the state enum and the `IdempotencyRecordState` type.
- **`IdempotencyRecordDocument`** — interface describing a stored attempt: `key`, `caller`, `fingerprint`, `state`, and optional `status` / `body` / `location` (populated only after the handler answers).
- **`IdempotencyRecordModel`** — Mongoose `Model` type parameterized on the document interface.
- **`idempotencyRecordSchema`** — the schema definition. Notable points: `body` uses `Schema.Types.Mixed` because its shape varies per route; `timestamps: true` adds `createdAt`/`updatedAt`.
- **Unique index** `idempotency_key_caller_unique` on `{ key, caller }` — acts as the distributed lock; `idempotency.ts` interprets the `E11000` collision as the "already in-flight / replay" signal rather than an error.
- **TTL index** `idempotency_createdAt_ttl` on `{ createdAt }` — auto-deletes records after `NODE_IDEMPOTENCY_RETENTION_HOURS` (default 24 h).
- **`idempotencyRecordModel`** — the exported model entrypoint; collection name is `idempotencyrecords`.

## Relationships

- **`src/infrastructure/http/config.ts`** — imports `idempotencyConfig()` to read `NODE_IDEMPOTENCY_RETENTION_HOURS` at module load time for the TTL index.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — the middleware that performs the insert (lock) / read (replay) / update (persist outcome) flow against `idempotencyRecordModel`.
- **`tests/contract/idempotency.test.ts`** — contract-level tests exercising the idempotency guarantee end-to-end.
- **`tests/unit/infrastructure/http/middlewares/idempotency.test.ts`** — unit tests for the middleware logic that depends on this model.

## Notes

- **Infrastructure-owned, not module-owned.** This collection has no domain module; it follows the same exception as `rate-limit.ts`'s store. Do not expect a per-module registry/manifest/folder for it.
- **TTL is baked in at import time.** `retentionHours` is read once from config. Changing `NODE_IDEMPOTENCY_RETENTION_HOURS` and simply restarting the server will **fail boot** because Mongo refuses to alter an existing index's `expireAfterSeconds`. Run `npm run db:sync` to drop and rebuild the index.
- **`E11000` is a feature, not a bug.** The unique index collision is the mechanism `idempotency.ts` uses to detect an in-flight or already-completed request; it is never surfaced as an HTTP 500.
- **`body` is untyped on purpose (`Mixed`).** Each route's response shape differs; the ledger stores it opaquely and replays it verbatim.
