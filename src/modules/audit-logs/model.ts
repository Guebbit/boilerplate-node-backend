/**
 * @module
 * Persisted audit trail — the durable half of `@infrastructure/observability/audit`. The audit
 * *logger* remains the compliance record; this collection exists so `GET /observability/audit`
 * can answer "what has actor X done" from the API. snake_case fields, unlike every other model
 * here: returned verbatim as `AuditEventItem` in `openapi.yaml`, matching the log lines a SIEM
 * ingests — renaming would mean mapping on every read.
 *
 * See: docs/modules/audit-logs.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { environmentNumber } from '@infrastructure/runtime/environment';
import type { AuditEntry } from '@infrastructure/observability/audit';

/**
 * A stored audit entry — `AuditEntry` from `@infrastructure/observability/audit`, as a document.
 *
 * Derived:  DERIVED from that type rather than restated beside it, because the two are the same
 *           shape by design: the sink persists what it is handed and the controller returns what
 *           it reads, so no translation exists in either direction. Restated, they were the same
 *           fields written twice and a field added to one of them would have compiled fine
 *           against the other.
 * `action`: the one field this widens, on purpose. `AuditAction` is the set of actions THIS BUILD
 *           emits; a row already in the collection was written by whatever build was deployed when
 *           it happened, and may name an action since renamed or retired. `string` is what is
 *           actually in the database, and typing a read as the narrower union would be a claim
 *           about history that nothing enforces.
 *
 * The import is type-only, so nothing here depends on the sink at runtime.
 */
export interface AuditLogDocument extends Document, Omit<AuditEntry, 'action'> {
    action: string;
}

/** Mongoose model type for {@link AuditLogDocument}. */
export type AuditLogModel = Model<AuditLogDocument>;

/**
 * How long an entry survives, in days. Read at import time because a TTL index is created once,
 * at startup, from whatever value is configured then — see the note on the index below.
 */
const retentionDays = environmentNumber('NODE_AUDIT_RETENTION_DAYS', 90, 1);

/** Audit collection schema. */
export const auditLogSchema = new Schema<AuditLogDocument, AuditLogModel>(
    {
        actor_user_id: {
            type: String,
            required: true
        },
        actor_role: {
            type: String,
            enum: ['admin', 'user', 'anonymous'],
            required: true
        },
        // Open where `actor_role` is closed — no enum, so a renamed or newly added preset role
        // never needs a migration here. See `actor_role_name` on `AuditEvent`.
        actor_role_name: {
            type: String
        },
        // Not `required`: a row written before this field existed stays valid, and reads as
        // "unknown which world" rather than failing validation on the way back out.
        actor_scope: {
            type: String,
            enum: ['tenant', 'platform']
        },
        action: {
            type: String,
            required: true
        },
        outcome: {
            type: String,
            enum: ['success', 'failure'],
            required: true
        },
        ip: {
            type: String
        },
        user_agent: {
            type: String
        },
        request_id: {
            type: String
        },
        trace_id: {
            type: String
        },
        target_type: {
            type: String
        },
        target_id: {
            type: String
        },
        // Free-form by design: `metadata` carries action-specific extras, and the audit vocabulary
        // is open enough that typing it would mean a schema change per new call site.
        metadata: {
            type: Schema.Types.Mixed
        },
        timestamp: {
            type: Date,
            required: true
        },
        level: {
            type: String,
            enum: ['info', 'warn'],
            required: true
        }
    },
    {
        // No `timestamps: true`: the entry carries its own `timestamp`, stamped at the moment the
        // action happened rather than the moment the write landed. A second, near-identical
        // `createdAt` would only invite queries to pick the wrong one.
        timestamps: false,
        // Fail an offline write immediately instead of queueing it: nothing waits on
        // `auditLogService.record`, so Mongoose's default ten-second buffer only turns an
        // unreachable database into a pending timer per audited request. See
        // `docs/modules/audit-logs.md`'s "Offline writes" section for the full reasoning.
        bufferCommands: false
    }
);

/*
 * Indexes matching the three filtered ways the endpoints are queried. All three are compound with
 * `timestamp: -1` because every query sorts newest-first — a plain `{ actor_user_id: 1 }` index
 * would find the matching entries and then sort them in memory, which is the shape that falls
 * over first as the collection grows.
 *
 * The unfiltered listing sorts on `timestamp` alone, and the TTL index below already covers that:
 * a single-field index is walked in either direction, so a second one differing only in sort
 * order would be maintained on every write and answer nothing the first cannot.
 */
auditLogSchema.index({ actor_user_id: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
// "What happened to this row" — the question `GET /audit`'s `target` filter answers.
auditLogSchema.index({ target_id: 1, timestamp: -1 });

/*
 * TTL index — Mongo deletes entries older than the retention window on its own.
 *
 * Without it this collection is the one thing here that only ever grows, and audit entries are
 * written on paths as hot as every failed login and every rate-limit block.
 *
 * Caveat worth knowing: Mongo will not modify an existing TTL index's `expireAfterSeconds` in
 * place. Raising or lowering `NODE_AUDIT_RETENTION_DAYS` and restarting FAILS THE BOOT —
 * `autoIndex` asks for the new window and Mongo refuses the conflicting options. `npm run db:sync`
 * is what applies it, by dropping the index and rebuilding it.
 */
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

/**
 * Serialized shape returned to the admin dashboard.
 *
 * `_id` and `__v` are dropped rather than renamed to `id`: unlike every other collection here, an
 * audit entry has no addressable endpoint (`GET /observability/audit/:id` does not exist and
 * should not — entries are read as a stream, never individually), so exposing an id would invite
 * one to be built. That is also why `virtuals` is off: Mongoose's free `id` virtual would put
 * back exactly the field `dropId` exists to remove. `timestamp` becomes an ISO-8601 string,
 * matching `format: date-time` in `openapi.yaml`.
 */
export const applyAuditLogTransform = applySerialization(auditLogSchema, {
    dropId: true,
    virtuals: false,
    after: (serialized) => {
        if (serialized.timestamp instanceof Date)
            serialized.timestamp = serialized.timestamp.toISOString();
    }
});

/** Audit model entrypoint. */
export const auditLogModel = model<AuditLogDocument, AuditLogModel>('AuditLog', auditLogSchema);
