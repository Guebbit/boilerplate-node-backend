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
import type { CartLineRemovedParams, CartMergeRefusedParams } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** Every code a notification can carry — the contract's `NotificationCode`, spelled out once. */
export const NOTIFICATION_CODES = [
    'notifications.cart-line-removed',
    'notifications.wishlist-item-removed',
    'notifications.cart-merge-refused'
] as const;

/** One of {@link NOTIFICATION_CODES}. */
export type NotificationCode = (typeof NOTIFICATION_CODES)[number];

/** What a message means, not how it looks — the contract's `NotificationSeverity`. */
export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'error'] as const;

/** One of {@link NOTIFICATION_SEVERITIES}. */
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/**
 * What each code's `params` holds — the contract's per-variant params, keyed by the code that
 * owns them. The one place a code and its params are tied together.
 */
export interface NotificationParametersByCode {
    'notifications.cart-line-removed': CartLineRemovedParams;
    'notifications.wishlist-item-removed': CartLineRemovedParams;
    'notifications.cart-merge-refused': CartMergeRefusedParams;
}

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
    readAt?: Date;
    createdAt: Date;
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
 */
export const notificationSchema = new Schema<NotificationDocument>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        code: { type: String, enum: NOTIFICATION_CODES, required: true },
        params: { type: Schema.Types.Mixed, default: {} },
        severity: { type: String, enum: NOTIFICATION_SEVERITIES, required: true },
        readAt: { type: Date }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

/*
 * The one read — a user's inbox, newest first — and the cap's trim, which walks the same order
 * from the far end. One compound index serves both.
 */
notificationSchema.index({ userId: 1, createdAt: -1 });

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
