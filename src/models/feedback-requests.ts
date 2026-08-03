import { model, Schema } from 'mongoose';
import type { Document, Model, QueryFilter } from 'mongoose';
import { FeedbackRequestStatus } from '@types';
import type { FeedbackRequest } from '@types';

/** Mongoose document type for feedback tickets. Overrides the API-generated
 * FeedbackRequest's 'respondedAt'/'createdAt'/'updatedAt' (string vs Date). */
export interface IFeedbackRequestDocument
    extends Omit<FeedbackRequest, 'id' | 'respondedAt' | 'createdAt' | 'updatedAt'>, Document {
    respondedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model + query helper types. */
export type IFeedbackRequestModel = Model<IFeedbackRequestDocument>;
/** Shorthand type for Mongoose query filters on the feedback collection. */
export type IFeedbackRequestQueryFilter = QueryFilter<IFeedbackRequestDocument>;

/**
 * Normalizes a serialized feedback request: `_id` → `id`, drops `__v`.
 * Exported so lean results (which bypass `toJSON`) can be mapped through the
 * same logic — see @services/feedback-requests `search()`.
 */
export const applyFeedbackRequestTransform = (
    serialized: Record<string, unknown>
): Record<string, unknown> => {
    if (serialized._id) {
        serialized.id = serialized._id.toString();
        delete serialized._id;
    }
    delete serialized.__v;
    return serialized;
};

/** Feedback collection schema. */
export const feedbackRequestSchema = new Schema<IFeedbackRequestDocument, IFeedbackRequestModel>(
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

/** Indexes for admin list/search queries. */
feedbackRequestSchema.index({ status: 1, createdAt: -1 });
feedbackRequestSchema.index({ email: 1, createdAt: -1 });

feedbackRequestSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_document, serialized) =>
        applyFeedbackRequestTransform(serialized as unknown as Record<string, unknown>)
});

/** Feedback model entrypoint. */
export const feedbackRequestModel = model<IFeedbackRequestDocument, IFeedbackRequestModel>(
    'FeedbackRequest',
    feedbackRequestSchema
);
