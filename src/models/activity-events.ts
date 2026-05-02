import { model, Schema, Types } from 'mongoose';
import type { Document, Model, QueryFilter } from 'mongoose';

export enum EActivityEventType {
    ADMIN_ACTIVITY = 'admin_activity',
    LOGIN_SUCCESS = 'login_success',
    LOGIN_FAILED = 'login_failed',
    SUSPICIOUS_ACTIVITY = 'suspicious_activity'
}

export enum EActivitySeverity {
    INFO = 'info',
    WARNING = 'warning',
    CRITICAL = 'critical'
}

export interface IActivityEvent {
    type: EActivityEventType;
    actorUserId?: Types.ObjectId;
    targetUserId?: Types.ObjectId;
    targetEmail?: string;
    method?: string;
    route?: string;
    ipAddress?: string;
    userAgent?: string;
    statusCode?: number;
    severity?: EActivitySeverity;
    resolved?: boolean;
    notes?: string;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IActivityEventDocument extends IActivityEvent, Document {}

export type IActivityEventModel = Model<IActivityEventDocument>;

export type IActivityEventQueryFilter = QueryFilter<IActivityEventDocument>;

export const activityEventSchema = new Schema<IActivityEventDocument, IActivityEventModel>(
    {
        type: {
            type: String,
            enum: Object.values(EActivityEventType),
            required: true
        },
        actorUserId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        targetUserId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        targetEmail: {
            type: String
        },
        method: {
            type: String
        },
        route: {
            type: String
        },
        ipAddress: {
            type: String
        },
        userAgent: {
            type: String
        },
        statusCode: {
            type: Number
        },
        severity: {
            type: String,
            enum: Object.values(EActivitySeverity),
            default: EActivitySeverity.INFO
        },
        resolved: {
            type: Boolean,
            default: false
        },
        notes: {
            type: String
        },
        metadata: {
            type: Schema.Types.Mixed
        }
    },
    {
        timestamps: true
    }
);

activityEventSchema.index({ type: 1, createdAt: -1 });
activityEventSchema.index({ targetEmail: 1, createdAt: -1 });
activityEventSchema.index({ ipAddress: 1, createdAt: -1 });

export const activityEventModel = model<IActivityEventDocument, IActivityEventModel>(
    'ActivityEvent',
    activityEventSchema
);
