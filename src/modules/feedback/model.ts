import { model, Schema } from 'mongoose';
import type { Document, Model, QueryFilter } from 'mongoose';
import { FeedbackRequestStatus } from '@types';
import type { FeedbackRequest } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** Mongoose document type for feedback tickets. Overrides the API-generated
 * FeedbackRequest's 'respondedAt'/'createdAt'/'updatedAt' (string vs Date). */
export interface FeedbackRequestDocument
    extends Omit<FeedbackRequest, 'id' | 'respondedAt' | 'createdAt' | 'updatedAt'>, Document {
    respondedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model + query helper types. */
export type FeedbackRequestModel = Model<FeedbackRequestDocument>;
/** Shorthand type for Mongoose query filters on the feedback collection. */
export type FeedbackRequestQueryFilter = QueryFilter<FeedbackRequestDocument>;

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
