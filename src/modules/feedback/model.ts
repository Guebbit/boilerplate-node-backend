/**
 * @module
 * Feedback request schema — one collection, a leaf in both directions (see `./module`).
 *
 * `respondedAt`/`createdAt`/`updatedAt` are overridden from the generated `FeedbackRequest` type
 * (string → Date): Mongoose holds native dates, and serialization is what narrows them back to
 * the wire's ISO strings.
 *
 * See: docs/modules/feedback.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { FeedbackRequestStatus } from '@types';
import type { FeedbackRequest } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * How long a ticket survives, in days, before Mongo's TTL index removes it. Read at import time
 * because a TTL index is created once, at startup, from whatever value is configured then —
 * see the note on the index below. Default: 730 (24 months) — a contact request can be evidence
 * in a commercial dispute, and 24 months sits inside the common limitation periods.
 */
const retentionDays = environmentNumber('NODE_FEEDBACK_RETENTION_DAYS', 730, 1);

/** Mongoose document type for feedback tickets. Overrides the API-generated
 * FeedbackRequest's 'respondedAt'/'createdAt'/'updatedAt' (string vs Date). */
export interface FeedbackRequestDocument
    extends Omit<FeedbackRequest, 'id' | 'respondedAt' | 'createdAt' | 'updatedAt'>, Document {
    respondedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for {@link FeedbackRequestDocument}. */
export type FeedbackRequestModel = Model<FeedbackRequestDocument>;

/** Feedback collection schema. */
export const feedbackRequestSchema = new Schema<FeedbackRequestDocument, FeedbackRequestModel>(
    {
        name: {
            type: String
        },
        email: {
            type: String,
            required: true
        },
        subject: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: Object.values(FeedbackRequestStatus),
            default: FeedbackRequestStatus.new
        },
        adminNotes: {
            type: String
        },
        respondedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

/*
 * The admin list filters by status and sorts newest-first, which is exactly this key.
 *
 * There is deliberately no index on `email`: the only query that touches it matches
 * case-insensitively and unanchored, and no B-tree index can serve that — the collection is
 * scanned either way, so an index would be write cost buying nothing.
 */
feedbackRequestSchema.index({ status: 1, createdAt: -1 });

/*
 * TTL index — Mongo deletes tickets older than the retention window on its own. Its OWN index,
 * not the compound one above: Mongo only honours `expireAfterSeconds` on a single-field
 * ASCENDING index, and `{ status: 1, createdAt: -1 }` is both compound and descending —
 * attaching the option there would produce an index that silently never deletes anything.
 *
 * Caveat worth knowing: Mongo will not modify an existing TTL index's `expireAfterSeconds` when
 * the value changes. Raising or lowering `NODE_FEEDBACK_RETENTION_DAYS` on a database that
 * already has this index does nothing until the index is dropped and recreated — use a migration
 * under `db/migrations/` (`collMod`) rather than expecting a restart to apply it. See
 * `audit-logs/model.ts` for the identical caveat on that module's own TTL index.
 */
feedbackRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

/**
 * Normalizes a serialized feedback request: `_id` → `id`, drops `__v`.
 * Exported so lean results (which bypass `toJSON`) can be mapped through the
 * same logic — see `./service` `search()`.
 */
export const applyFeedbackRequestTransform = applySerialization(feedbackRequestSchema);

/** Feedback model entrypoint. */
export const feedbackRequestModel = model<FeedbackRequestDocument, FeedbackRequestModel>(
    'FeedbackRequest',
    feedbackRequestSchema
);
