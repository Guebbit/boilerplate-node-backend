---
source: src/modules/audit-logs/model.ts
sha256: 1533f9714edbf3f7d1efe59da65bd04c0ea92249892def27b834791256b26a57
generated_at: 2026-10-14T15:04:38.588361+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/model.ts

## Purpose

Defines the Mongoose schema, indexes, serialization transform, and model for the `AuditLog` collection — the durable store behind `GET /observability/audit`. It persists the same shape that the audit logger (`@infrastructure/observability/audit`) emits, so no translation layer exists between write and read.

## Key elements

- **`AuditLogDocument`** — Interface extending `Document` and `Omit<AuditEntry, 'action'>`, with `action` widened to `string` so historical rows (written by older builds) remain readable without a schema migration.
- **`AuditLogModel`** — Mongoose `Model` type alias for the document.
- **`auditLogSchema`** — The full schema. Notable settings: `timestamps: false` (the entry carries its own event-time `timestamp`), `bufferCommands: false` (fail fast on unreachable DB rather than queueing).
- **`applyAuditLogTransform`** — Serialization wrapper built via `applySerialization`. Drops `_id`/`__v`, disables Mongoose `id` virtuals, and converts `timestamp` to an ISO-8601 string for the OpenAPI `date-time` contract.
- **`auditLogModel`** — The registered Mongoose model; the import-time entrypoint used by the repository.
- **Indexes** — Three compound `{field: 1, timestamp: -1}` indexes covering the `actor`, `action`, and `target` query filters, plus a TTL index on `timestamp` that enforces `NODE_AUDIT_RETENTION_DAYS`.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Provides the `AuditEntry` type and the `AUDIT_ACTOR_ROLES`, `AUDIT_LEVELS`, `AUDIT_OUTCOMES` constants used as enum constraints. Type-only import; no runtime dependency on the logger.
- **`src/infrastructure/persistence/serialize.ts`** — Supplies `applySerialization`, the shared helper that builds the response transform.
- **`src/modules/audit-logs/config.ts`** — Source of `NODE_AUDIT_RETENTION_DAYS`, read once at import time to set the TTL window.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Provides `AUTHORIZATION_SCOPES` for the `actorScope` enum.
- **`src/modules/audit-logs/repository.ts`** — Consumes `auditLogModel` and `applyAuditLogTransform` to read and shape entries for the controller.
- **`scenarios/flows/backdate.ts`** — Integration test flow that exercises audit-log writes/reads through the full stack.

## Notes

- **TTL index is immutable in place.** Changing `NODE_AUDIT_RETENTION_DAYS` and restarting with `autoIndex` enabled will *fail the boot* because Mongo refuses to modify an existing TTL index's `expireAfterSeconds`. Run `npm run db:sync` (drop + rebuild) after changing the value.
- **`action` is intentionally `string`, not the `AuditAction` union.** A narrower type would be an unenforceable claim about every row ever written. The union still guards *writes* at the logger level.
- **`metadata` is `Mixed` (untyped).** Adding a new action-specific field does not require a schema change; the cost is no DB-level type safety on that field.
- **No `id` is exposed.** Audit entries are read as a stream only; there is no `GET /observability/audit/:id` endpoint, and the serialization explicitly removes `_id`/`__v` to discourage one.
