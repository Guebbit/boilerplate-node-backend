import { model, Schema } from 'mongoose';
import type { Document, Model, QueryFilter } from 'mongoose';

/**
 * Persisted audit trail — the durable half of `@core/observability/audit`.
 *
 * The audit *logger* remains the compliance record: it writes to a file (and to Loki when
 * configured) and is what an auditor is shown. This collection exists for a narrower job — letting
 * `GET /observability/audit` answer "what has actor X done" from the API, without a log backend
 * being wired up. It replaced a 200-entry in-process ring buffer that could not answer it: the
 * buffer held 200 entries *in total* across every actor, kept a different slice in each cluster
 * worker, and emptied on restart.
 *
 * snake_case field names, unlike the camelCase used by every other model here. They are not a
 * style slip: these documents are returned verbatim as `AuditEventItem` in `openapi.yaml`, whose
 * field names were chosen to match the log lines a SIEM ingests. Renaming them here would mean
 * mapping on every read, and would break the admin dashboard that already renders them.
 */

/**
 * A stored audit entry. Structurally identical to `IAuditEntry` in
 * `@core/observability/audit`, which is deliberate — the sink persists what it is handed, and the
 * controller returns what it reads, so no shape translation exists in either direction to drift.
 */
export interface IAuditLogDocument extends Document {
    actor_user_id: string;
    actor_role: 'admin' | 'user' | 'anonymous';
    action: string;
    outcome: 'success' | 'failure';
    ip?: string;
    user_agent?: string;
    request_id?: string;
    trace_id?: string;
    target_type?: string;
    target_id?: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
    level: 'info' | 'warn';
}

/** Mongoose model + query helper types. */
export type IAuditLogModel = Model<IAuditLogDocument>;
/** Shorthand type for Mongoose query filters on the audit collection. */
export type IAuditLogQueryFilter = QueryFilter<IAuditLogDocument>;

/**
 * How long an entry survives, in days. Read at import time because a TTL index is created once,
 * at startup, from whatever value is configured then — see the note on the index below.
 */
const retentionDays = Number.parseInt(process.env.NODE_AUDIT_RETENTION_DAYS ?? '90', 10);

/**
 * Serialized shape returned to the admin dashboard.
 *
 * `_id` and `__v` are dropped rather than renamed to `id`: unlike every other collection here, an
 * audit entry has no addressable endpoint (`GET /observability/audit/:id` does not exist and
 * should not — entries are read as a stream, never individually), so exposing an id would invite
 * one to be built. `timestamp` becomes an ISO-8601 string, matching `format: date-time` in
 * `openapi.yaml`.
 */
export const applyAuditLogTransform = (
    serialized: Record<string, unknown>
): Record<string, unknown> => {
    delete serialized._id;
    delete serialized.__v;
    if (serialized.timestamp instanceof Date)
        serialized.timestamp = serialized.timestamp.toISOString();
    return serialized;
};

/** Audit collection schema. */
export const auditLogSchema = new Schema<IAuditLogDocument, IAuditLogModel>(
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
        timestamps: false
    }
);

/*
 * Indexes matching the three ways the endpoint is queried. All are compound with `timestamp: -1`
 * because every query sorts newest-first — a plain `{ actor_user_id: 1 }` index would find the
 * matching entries and then sort them in memory, which is the shape that falls over first as the
 * collection grows.
 */
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actor_user_id: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

/*
 * TTL index — Mongo deletes entries older than the retention window on its own.
 *
 * Without it this collection is the one thing here that only ever grows, and audit entries are
 * written on paths as hot as every failed login and every rate-limit block.
 *
 * Caveat worth knowing: Mongo will not modify an existing TTL index's `expireAfterSeconds` when
 * the value changes. Raising or lowering `NODE_AUDIT_RETENTION_DAYS` on a database that already
 * has this index does nothing until the index is dropped and recreated — use a migration under
 * `db/migrations/` (`collMod`) rather than expecting a restart to apply it.
 */
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

auditLogSchema.set('toJSON', {
    versionKey: false,
    transform: (_document, serialized) =>
        applyAuditLogTransform(serialized as unknown as Record<string, unknown>)
});

/** Audit model entrypoint. */
export const auditLogModel = model<IAuditLogDocument, IAuditLogModel>('AuditLog', auditLogSchema);
