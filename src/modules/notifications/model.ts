/**
 * @module
 * A notification is one row per message per user: a `code` and its `params`, never the sentence.
 * The frontend translates the code from its own locale files, so a row outlives a language change
 * and carries no copy this backend would have to keep in step with it.
 *
 * See: docs/modules/notifications.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { NotificationAudience, NotificationSeverity } from '@types';
import type { Notification } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** One of the contract's notification codes: the `code` of each variant of `Notification`, whichever module added it. */
export type NotificationCode = Notification['code'];

/**
 * What each code's `params` holds — the contract's per-variant params, keyed by the code that
 * owns them. The one place a code and its params are tied together.
 */
export type NotificationParametersByCode = {
    [N in Notification as N['code']]: N['params'];
};

/**
 * The `code` + `params` pair of one notification, as a union with one member per code. Narrowing
 * on `code` therefore narrows `params` — the same shape the contract's `Notification` has.
 */
export type NotificationBody = {
    [C in NotificationCode]: { code: C; params: NotificationParametersByCode[C] };
}[NotificationCode];

/** The fields every notification carries, whatever its code. */
interface NotificationCommon extends Document {
    userId: Types.ObjectId;
    severity: NotificationSeverity;
    /** `own` for a person's own message, `staff` for a work notice. */
    audience: NotificationAudience;
    readAt?: Date;
    createdAt: Date;
    /** Staff rows only: the shop the notice is about; the read filters by the caller's shop. */
    tenantId?: string;
    /** Staff rows only: permission sets that earned it. Checked at read time; never on the wire. */
    sets?: string[];
    /** Staff rows only: one row per situation per recipient (`<kind>:<entity>`). */
    dedupeKey?: string;
    /** Staff rows only: when the TTL index removes it. */
    expiresAt?: Date;
}

/**
 * Notification Document: the common fields plus one {@link NotificationBody}. Stored `params` is
 * `Mixed`, so this type is a promise kept by the writers (`NewNotification` is built from the
 * same union) rather than something the database checks.
 */
export type NotificationDocument = NotificationCommon & NotificationBody;

/** Notification Document model type. Queries live in `./repository`, rules in `./services`. */
export type NotificationModel = Model<NotificationDocument>;

/**
 * Mongoose schema for persisted notifications.
 *
 * `updatedAt` is switched off: a row is written once and its only later change is `readAt`, which
 * says so itself. `params` is `Mixed` because its shape depends on `code`.
 *
 * The type is written out because the code union grew past what TypeScript can serialize for an
 * inferred one (TS7056).
 */
export const notificationSchema: Schema<NotificationDocument> = new Schema<NotificationDocument>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        // Open set: the module that writes a code owns it, so no list here can go stale.
        code: { type: String, required: true },
        params: { type: Schema.Types.Mixed, default: {} },
        severity: { type: String, enum: Object.values(NotificationSeverity), required: true },
        audience: {
            type: String,
            enum: Object.values(NotificationAudience),
            default: 'own',
            required: true
        },
        readAt: { type: Date },
        tenantId: { type: String },
        sets: { type: [String], default: undefined },
        dedupeKey: { type: String },
        expiresAt: { type: Date }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

/*
 * The one read — a user's inbox, newest first — and the cap's trim, which walks the same order
 * from the far end. One compound index serves both.
 */
notificationSchema.index({ userId: 1, createdAt: -1 });

/*
 * One work notice per situation per recipient: a redelivered event upserts into the same row.
 * Partial, because a person's own messages carry no key and must never collide on its absence.
 */
notificationSchema.index(
    { userId: 1, dedupeKey: 1 },
    { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

/* Staff rows age out by themselves; `expiresAt` is set only on them. */
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Normalizes a serialized notification: `_id` → `id`, drops `__v`. Owed to the repository factory
 * for its lean reads (see `normalize` in @infrastructure/persistence/create-repository).
 */
export const applyNotificationTransform = applySerialization(notificationSchema);

/** Notification model entrypoint. */
export const notificationModel = model<NotificationDocument, NotificationModel>(
    'Notification',
    notificationSchema
);
