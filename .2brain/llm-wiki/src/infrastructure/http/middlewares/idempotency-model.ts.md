---
source: src/infrastructure/http/middlewares/idempotency-model.ts
sha256: 03c7f009fa1a28da2befd1cecce86b8f5cb443af97de9991e61c6da3beb84279
generated_at: 2026-10-29T02:02:37.947244+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency-model.ts

## Purpose

Defines the Mongoose schema, model, and TypeScript types for the idempotency ledger collection (`idempotencyrecords`). Each document represents one attempt keyed by `(key, caller)`, recording the request fingerprint and, once the handler has answered, the response to replay on a subsequent identical request. It lives in infrastructure (not under a domain module) because it belongs to no single module — the same exception applied to `rate-limit.ts`'s store.

## Key elements

- **`IDEMPOTENCY_RECORD_STATES`** — `as const` array `['in-flight', 'done']`; the single source of truth for the `state` enum.
- **`IdempotencyRecordState`** — exported type derived from the const array (`'in-flight' | 'done'`).
- **`IdempotencyRecordDocument`** — exported interface extending `Document`; describes the shape of a ledger entry (`key`, `caller`, `fingerprint`, `state`, optional `status`/`body`/`location`/`contentType`/`headers`, timestamps).
- **`IdempotencyRecordModel`** — exported Mongoose `Model` type alias.
- **`idempotencyRecordSchema`** — Mongoose `Schema` with `timestamps: true`; two indexes:
  - **Unique compound** on `{ key, caller }` (name `idempotency_key_caller_unique`). Insertion is the lock; `E11000` collision signals "someone else holds this key."
  - **TTL** on `{ createdAt }` (name `idempotency_createdAt_ttl`), `expireAfterSeconds = retentionHours * 3600`.
- **`idempotencyRecordModel`** — the exported `model(...)` entrypoint; collection name `idempotencyrecords`.
- **`retentionHours`** — read once at import time from `idempotencyConfig().NODE_IDEMPOTENCY_RETENTION_HOURS` (default 24 h).

## Relationships

- **`src/infrastructure/http/config.ts`** — provides `idempotencyConfig()`, from which the retention-hours value is read at module load. Changing the env var does not affect a running process; it must be read before the schema is built.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — the middleware that performs the three-way branch (new insert / in-flight wait / replay) against this model. It interprets the unique-index `E11000` error as a domain signal, not a failure, and writes `state: 'done'` + response fields after the handler answers.
- **`tests/unit/infrastructure/http/middlewares/idempotency.test.ts`** / **`tests/unit/infrastructure/http/middlewares/idempotency-retention.test.ts`** — unit tests covering insert/replay logic and TTL behavior.
- **`tests/contract/idempotency.test.ts`** — contract-level tests exercising the ledger through HTTP.
- **`tests/integration/idempotency-server-fault.test.ts`** — integration test for server-fault recovery against the ledger.

## Notes

- **TTL index is not hot-updatable.** Raising or lowering `NODE_IDEMPOTENCY_RETENTION_HOURS` and restarting will **fail the boot**, because Mongoose cannot alter an existing index's `expireAfterSeconds` in place. Run `npm run db:sync` (drops and rebuilds the index) after changing the value. This applies to every TTL index in the repo.
- **`body` and `headers` use `Schema.Types.Mixed`.** Response shapes vary per route; `headers` is a flat `Record<string, string>` limited to a fixed allow-list (`Retry-After`, `WWW-Authenticate`, `Allow`).
- **`location` and `contentType` are replay aids.** A 201's `Location` header and a non-default `Content-Type` are stored so a replayed response is indistinguishable from the original.
- **`status`/`body`/`location`/`contentType`/`headers` are all optional** — they are absent while `state === 'in-flight'` and only populated after the guarded handler responds.
- **The unique index is the concurrency primitive.** There is no separate "lock" field; the atomic insert-or-collide on `{ key, caller }` is the entire locking mechanism.
