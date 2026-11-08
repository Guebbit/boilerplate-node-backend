---
source: src/modules/audit-logs/model.ts
sha256: 8f2ea8e1f3baa7d61d39b59f19220b685e55477bf28403ad36ec0c1a7b7cc9ee
generated_at: 2026-11-08T05:08:03.033635+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/model.ts

## Purpose

Defines the Mongoose schema, indexes, TTL policy, and serialization transform for the persisted audit-trail collection. It is the durable store behind `GET /observability/audit`, letting the API answer "what has actor X done" without re-reading the compliance log line. The shape is intentionally 1:1 with `AuditEntry` from the observability layer so no translation exists in either direction.

## Key elements

- **`AuditLogDocument`** — Interface extending Mongoose `Document` and `Omit<AuditEntry, 'action'>`, with `action` widened to `string` (historical rows may reference renamed/retired actions).
- **`auditLogSchema`** — Mongoose `Schema` with explicit field definitions. Notable choices: `actorRole` is a closed enum (`AUDIT_ACTOR_ROLES`) while `actorRoleName` is open (no enum) to avoid migrations on new presets; `metadata` is `Schema.Types.Mixed` (free-form); `timestamps: false` (entry stamps its own `timestamp`); `bufferCommands: false` (fail offline writes immediately rather than queue).
- **Indexes** — Three compound ascending-on-filter / descending-on-`timestamp` indexes (`actorUserId`, `action`, `targetId`) matching the three filtered query shapes of `GET /audit`. A fourth index on `{ timestamp: 1 }` with `expireAfterSeconds` provides TTL deletion and also serves the unfiltered newest-first listing.
- **`applyAuditLogTransform`** — Serialization pipeline (via `applySerialization`) that drops `_id`/`__v`, disables Mongoose `virtuals` (preventing a free `id` from reappearing), and converts `timestamp` to an ISO-8601 string for the `format: date-time` contract in `openapi.yaml`.
- **`auditLogModel`** — The registered Mongoose model (`'AuditLog'`), the entry point consumed by the repository.
- **`retentionDays`** — Read once at import time from `auditLogsConfig().NODE_AUDIT_RETENTION_DAYS`; feeds the TTL index.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Provides the `AuditEntry` type (type-only import) and the `AUDIT_ACTOR_ROLES`, `AUDIT_LEVELS`, `AUDIT_OUTCOMES` constants used as schema enums. This file is the persisted counterpart; that file is the in-memory logger/sink.
- **`src/infrastructure/persistence/serialize.ts`** — Supplies `applySerialization`, the generic helper that `applyAuditLogTransform` wraps with audit-specific options.
- **`src/modules/audit-logs/config.ts`** — Source of `auditLogsConfig()`, which yields `NODE_AUDIT_RETENTION_DAYS` consumed at import time for the TTL index.
- **`src/domain-primitives/time.ts`** — Provides `DAY_SECONDS` for converting retention days to the TTL index's `expireAfterSeconds`.
- **`src/types/index.ts`** — Provides `AUTHORIZATION_SCOPES` used as the enum for `actorScope`.
- **`src/modules/audit-logs/repository.ts`** — Consumes `auditLogModel` / `auditLogSchema` to execute reads and writes against the collection.
- **`src/modules/audit-logs/service.ts`** — Orchestrates recording; calls into the repository which uses this model.
- **`src/modules/audit-logs/index.ts`** — Barrel file re-exporting this module's public symbols.
- **`scenarios/flows/backdate.ts`** — Scenario flow that exercises audit recording, exercising the schema and serialization path.
- **Test files** (`tests/unit/retention.test.ts`, `tests/unit/schema-contract.test.ts`, `tests/unit/service.test.ts`, `tests/integration/repository.test.ts`, `tests/integration/incidents.test.ts`) — Assert schema shape, retention behavior, and query patterns against this model.
- **`tests/integration/scenarios/shop.test.ts`** — Integration test that triggers audit writes through the full stack.

## Notes

- **TTL index is immutable at runtime.** Mongo will not alter an existing TTL index's `expireAfterSeconds`. Changing `NODE_AUDIT_RETENTION_DAYS` and restarting will **fail boot** (`autoIndex` conflicts). Run `npm run db:sync` to drop and rebuild the index.
- **`action` is deliberately `string`, not the `AuditAction` union.** A row was written by whatever build was live at that time; typing reads as the narrower union would be an unenforceable claim about history.
- **No `id` field is exposed.** Unlike other collections, audit entries have no `GET /:id` endpoint. Dropping `_id` and disabling `virtuals` together ensures Mongoose's free `id` virtual cannot leak one back.
- **`actorRole` (enum) vs `actorRoleName` (open string).** The enum guards against typos in the preset slot; the open field carries the human-readable name so a renamed preset never requires a migration.
- **`bufferCommands: false`** means an unreachable database surfaces as an immediate error on every audited request rather than a silent 10-second queued buffer. Nothing downstream awaits the write, so the buffer only adds latency and hidden pending timers.
