---
source: src/infrastructure/http/middlewares/idempotency-model.ts
sha256: 65554bb5d8cd00aaff1c37e7e85234e5641fc63cb3a7c8be37c2b637164e0344
generated_at: 2026-09-23T17:43:31.120631+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency-model.ts

## Purpose

Mongoose schema and model for the idempotency ledger — one document per `(key, caller)` pair that records a retried write's fingerprint and, once the handler has answered, its response. This is the storage layer that `idempotency.ts` reads and writes against to implement replay, in-flight, and mismatch detection. It lives at the infrastructure level (not inside a domain module) because the collection belongs to no domain; the same exception applies to `rate-limit.ts`'s store.

## Key elements

- **`IdempotencyRecordState`** — union type `'in-flight' | 'done'`; tracks where a record sits in its lifecycle (the three-way branch in `idempotency.ts`).
- **`IdempotencyRecordDocument`** — Mongoose document interface: `key`, `caller`, `fingerprint`, `state`, optional `status`/`body`, and timestamps.
- **`IdempotencyRecordModel`** — Mongoose `Model` type alias.
- **`retentionHours`** — read once at import time via `environmentNumber('NODE_IDEMPOTENCY_RETENTION_HOURS', 24, 1)`; sets the TTL window in hours.
- **`idempotencyRecordSchema`** — the schema definition with two indexes:
  - Unique compound index on `(key, caller)` — acts as the distributed lock; a duplicate-key `E11000` error is the signal that another caller already holds the key.
  - TTL index on `createdAt` with `expireAfterSeconds = retentionHours * 3600`.
- **`idempotencyRecordModel`** — the exported Mongoose model (collection `idempotencyrecords`), the entry point used by `idempotency.ts`.

## Relationships

- **`idempotency.ts`** — consumes `idempotencyRecordModel` for all reads/writes; interprets `E11000` on insert as "key already held" rather than a DB error, and branches on `state` to decide replay vs. in-flight vs. mismatch.
- **`environment.ts`** — provides `environmentNumber()` used to read the retention-hours config at import time.
- **`tests/contract/idempotency.test.ts`** — exercises the ledger end-to-end (insert, replay, mismatch, TTL expiry).
- **`tests/unit/infrastructure/http/middlewares/idempotency.test.ts`** — unit-level coverage of the middleware logic built on this model.

## Notes

- **TTL index is not hot-reloadable.** Changing `NODE_IDEMPOTENCY_RETENTION_HOURS` and restarting will **fail the boot** because Mongoose refuses to modify an existing index's `expireAfterSeconds` in place. You must run `npm run db:sync` to drop and rebuild the index. This is the same caveat shared by every other TTL index in the repo (`feedback/model.ts`, `persistence/lease.ts`).
- **`E11000` is not an error.** The unique index is intentionally used as a mutex; `idempotency.ts` catches the duplicate-key error and treats it as the "someone else is here" signal. Do not add a generic error handler around inserts that would mask this.
- **`body` is `Mixed`.** The stored response shape varies per route; this is deliberate, not a type hole.
- **Infrastructure-owned exception.** This collection is not wrapped in a domain module on purpose — adding a module, registry entry, and manifest for four fields would be ceremony without benefit.
