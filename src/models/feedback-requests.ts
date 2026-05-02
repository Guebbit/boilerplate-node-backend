import { model, Schema } from 'mongoose';
import type { Document, Model, QueryFilter } from 'mongoose';

export enum EFeedbackStatus {
    NEW = 'new',
    IN_PROGRESS = 'in_progress',
    RESOLVED = 'resolved',
    SPAM = 'spam'
}

export interface IFeedbackRequest {
    name?: string;
    email: string;
    subject: string;
    message: string;
    status: EFeedbackStatus;
    adminNotes?: string;
    respondedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}
export interface IFeedbackRequestDocument extends IFeedbackRequest, Document {}
export type IFeedbackRequestModel = Model<IFeedbackRequestDocument>;
export type IFeedbackRequestQueryFilter = QueryFilter<IFeedbackRequestDocument>;

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
            enum: Object.values(EFeedbackStatus),
            default: EFeedbackStatus.NEW
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

feedbackRequestSchema.index({ status: 1, createdAt: -1 });
feedbackRequestSchema.index({ email: 1, createdAt: -1 });

export const feedbackRequestModel = model<IFeedbackRequestDocument, IFeedbackRequestModel>(
    'FeedbackRequest',
    feedbackRequestSchema
);
