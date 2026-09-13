/**
 * @module
 * The idempotency ledger: one document per `(key, caller)`, recording a retried write's
 * fingerprint and, once the handler has answered, its outcome — see `idempotency.ts` for the
 * read/write flow built on this schema and why it lives in Mongo rather than Redis.
 *
 * Infrastructure-owned rather than a module's, against the usual "a module owns its collection"
 * rule — the same exception `rate-limit.ts`'s store is under, for the same reason: this
 * collection belongs to no domain, and inventing a module to hold four fields would add a
 * registry entry, a manifest and a folder for nothing.
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { environmentNumber } from '@infrastructure/runtime/environment';

/** Where a record sits in its own lifecycle — see `idempotency.ts`'s three-way branch on it. */
export type IdempotencyRecordState = 'in-flight' | 'done';

/**
 * One stored attempt. `status`/`body` are absent until the guarded handler answers — see
 * {@link IdempotencyRecordState}.
 */
export interface IdempotencyRecordDocument extends Document {
    key: string;
    caller: string;
    fingerprint: string;
    state: IdempotencyRecordState;
    status?: number;
    body?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for {@link IdempotencyRecordDocument}. */
export type IdempotencyRecordModel = Model<IdempotencyRecordDocument>;

/**
 * How long a record survives, in hours, before Mongo's TTL index removes it. Read at import
 * time, like every other TTL window in this repo — a change needs `npm run db:sync` to take
 * effect, since Mongo will not modify an existing TTL index's `expireAfterSeconds` in place.
 * Default: 24 — long enough to outlast any client's retry backoff, short enough that a ledger
 * entry is never mistaken for a durable record of the write itself.
 */
const retentionHours = environmentNumber('NODE_IDEMPOTENCY_RETENTION_HOURS', 24, 1);

/** Idempotency ledger schema. */
export const idempotencyRecordSchema = new Schema<
    IdempotencyRecordDocument,
    IdempotencyRecordModel
>(
    {
        key: {
            type: String,
            required: true
        },
        caller: {
            type: String,
            required: true
        },
        fingerprint: {
            type: String,
            required: true
        },
        state: {
            type: String,
            enum: ['in-flight', 'done'],
            required: true,
            default: 'in-flight'
        },
        status: {
            type: Number
        },
        // The stored response body, replayed verbatim on a later hit — shape varies per route,
        // which is exactly what `Mixed` is for.
        body: {
            type: Schema.Types.Mixed
        }
    },
    {
        timestamps: true
    }
);

/*
 * The lock. One caller's insert either succeeds (nobody else holds this key yet) or collides on
 * E11000 (somebody already does) — `idempotency.ts` reads the collision itself as the signal to
 * fall into the in-flight/replay/mismatch branch, never as a database error to surface.
 */
idempotencyRecordSchema.index(
    { key: 1, caller: 1 },
    { unique: true, name: 'idempotency_key_caller_unique' }
);

/*
 * TTL index — Mongo deletes attempts older than the retention window on its own. Same caveat as
 * every other TTL index in this repo (see `feedback/model.ts` and `persistence/lease.ts`):
 * raising or lowering `NODE_IDEMPOTENCY_RETENTION_HOURS` and restarting FAILS THE BOOT, because
 * Mongo refuses to change an existing index's `expireAfterSeconds` in place. `npm run db:sync` is
 * what applies it, by dropping the index and rebuilding it.
 */
idempotencyRecordSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: retentionHours * 60 * 60, name: 'idempotency_createdAt_ttl' }
);

/** Idempotency ledger model entrypoint. Collection name `idempotencyrecords`. */
export const idempotencyRecordModel = model<IdempotencyRecordDocument, IdempotencyRecordModel>(
    'IdempotencyRecord',
    idempotencyRecordSchema
);
