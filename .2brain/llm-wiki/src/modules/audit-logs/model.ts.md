---
source: src/modules/audit-logs/model.ts
source_sha256: c5d5353b545451466acf297b86b839aac5eb4c19f95442df07c8a28c5f705cf5
context_sha256: b369adb64c70477852a82bd5a8f5f05debf336e3473c16327823ce770f8d88d7
generated_at: 2026-11-22T04:26:45.884692+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/model.ts

## Purpose
Defines the Mongoose model for the persisted audit trail. The audit logger remains the compliance record; this collection exists so `GET /observability/audit` can answer "what has actor X done" from the API. Fields are camelCase and returned verbatim as `AuditEntryItem` in `openapi.yaml`.

## Key elements
- **`AuditLogDocument`**: interface extending `Document` and `Omit<AuditEntry, 'action'>`. It is derived from `AuditEntry` so the two shapes cannot drift. `action` is widened to `string`, because stored rows may name actions that this build has since renamed or retired.
- **`AuditLogModel`**: `Model<AuditLogDocument>` type alias.
- **`auditLogSchema`**: the schema.
  - Required: `actorUserId`, `actorRole`, `actorScope`, `action`, `outcome`, `timestamp`, `level`.
  - Enums come from `AUDIT_ACTOR_ROLES`, `AUDIT_OUTCOMES` and `AUDIT_LEVELS` (from the audit infrastructure) and from `AUTHORIZATION_SCOPES` (from `@types`).
  - Optional: `actorCredentialId`, `actorRoleName` (deliberately not an enum), `ip`, `userAgent`, `requestId`, `traceId`, `targetType`, `targetId`, `subjectId`.
  - `metadata` is `Mixed`.
  - Options are `timestamps: false` and `bufferCommands: false`.
- **Indexes**:
  - Compound indexes with `timestamp: -1` on `actorUserId`, `action`, `targetId` and `subjectId`. They back the endpoint filters `actor`, `action`, `target` and `subject`.
  - A TTL index on `timestamp` with `expireAfterSeconds = NODE_AUDIT_RETENTION_DAYS * DAY_SECONDS`.
- **`applyAuditLogTransform`**: calls `applySerialization` with `dropId: true` and `virtuals: false`. An `after` hook converts `timestamp` to an ISO-8601 string.
- **`auditLogModel`**: the model, registered as `'AuditLog'`.

## Relationships
- **`@infrastructure/observability/audit`**: supplies the `AuditEntry` type (imported type-only) and the enum constant arrays. Nothing here depends on the sink at runtime.
- **`@infrastructure/persistence/serialize`**: provides `applySerialization`.
- **`./config`**: `auditLogsConfig().NODE_AUDIT_RETENTION_DAYS` sets the TTL window, read once at import time.
- **`@domain-primitives/time`**: provides `DAY_SECONDS`.
- **`@types`**: provides `AUTHORIZATION_SCOPES`.
- **`repository.ts`, `service.ts`, `index.ts`**: sibling module files that use this model. The tests in the neighbor list (repository, retention, schema-contract, service, incidents) cover it.

## Notes
- **Changing the retention window**: Mongo will not alter an existing TTL index's `expireAfterSeconds` in place. Changing `NODE_AUDIT_RETENTION_DAYS` and restarting fails the boot. Run `npm run db:sync` to drop and rebuild the index.
- **`bufferCommands: false`**: offline writes fail immediately instead of queueing. Nothing waits on `auditLogService.record`, so buffering would only leave a pending timer per audited request.
- **No `timestamps: true`**: the entry carries its own `timestamp`, set when the action happened. This avoids a second, near-identical `createdAt`.
- **No `id` in the serialized output**: `_id`/`__v` are dropped rather than renamed to `id`, and `virtuals` is off so the free `id` virtual does not bring it back. Entries have no addressable endpoint, and none should be added.
- **The unfiltered listing** is served by the TTL index on `timestamp`, which can be walked in either direction. That is why no separate `timestamp` index exists.
