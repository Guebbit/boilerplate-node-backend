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

/** One of the contract's notification codes: the `code` of each variant of `Notification`. */
export type NotificationCode = Notification['code'];

/**
 * Every code, as keys. The `satisfies` makes the list complete as well as valid: a code the
 * contract adds and this table lacks is a compile error, not a runtime refusal by the `enum`
 * of the schema below.
 */
const CODE_TABLE = {
    'notifications.cart-line-removed': true,
    'notifications.wishlist-item-removed': true,
    'notifications.cart-merge-refused': true,
    'notifications.fulfillment-delayed': true,
    'notifications.fulfillment-held': true,
    'notifications.shipment-lost': true,
    'notifications.stock-alert': true,
    'notifications.staff.purchase-hold-placed': true,
    'notifications.staff.webhook-disabled': true,
    'notifications.staff.ticket-opened': true,
    'notifications.staff.ticket-assigned': true,
    'notifications.staff.return-requested': true,
    'notifications.staff.outbox-dead': true,
    'notifications.staff.transfers-due': true,
    'notifications.staff.preorders-late': true,
    'notifications.staff.delivery-holds-open': true,
    'notifications.staff.withdrawals-awaiting-goods': true,
    'notifications.staff.returns-undecided': true,
    'notifications.staff.low-stock': true,
    'notifications.staff.unshipped': true,
    'notifications.staff.awaiting-tracking': true,
    'notifications.staff.undelivered': true,
    'notifications.staff.stale-refunds': true
} satisfies Record<NotificationCode, true>;

/** Every code a notification can carry. */
// `Object.keys` types as `string[]`; `CODE_TABLE`'s keys are exactly `NotificationCode`.
export const NOTIFICATION_CODES = Object.keys(CODE_TABLE) as NotificationCode[];

/** The codes of work notices: the ones `./staff-routing` finds an audience for. */
export const STAFF_NOTIFICATION_CODES = [
    'notifications.staff.purchase-hold-placed',
    'notifications.staff.webhook-disabled',
    'notifications.staff.ticket-opened',
    'notifications.staff.ticket-assigned',
    'notifications.staff.return-requested',
    'notifications.staff.outbox-dead',
    'notifications.staff.transfers-due',
    'notifications.staff.preorders-late',
    'notifications.staff.delivery-holds-open',
    'notifications.staff.withdrawals-awaiting-goods',
    'notifications.staff.returns-undecided',
    'notifications.staff.low-stock',
    'notifications.staff.unshipped',
    'notifications.staff.awaiting-tracking',
    'notifications.staff.undelivered',
    'notifications.staff.stale-refunds'
] as const satisfies readonly NotificationCode[];

/**
 * The work notices that are a count of what waits, rewritten by the daily digest instead of
 * announced once: one row per recipient whose `dedupeKey` is the code itself.
 */
export const STAFF_SUMMARY_CODES = [
    'notifications.staff.transfers-due',
    'notifications.staff.preorders-late',
    'notifications.staff.delivery-holds-open',
    'notifications.staff.withdrawals-awaiting-goods',
    'notifications.staff.returns-undecided',
    'notifications.staff.low-stock',
    'notifications.staff.unshipped',
    'notifications.staff.awaiting-tracking',
    'notifications.staff.undelivered',
    'notifications.staff.stale-refunds'
] as const satisfies readonly StaffNotificationCode[];

/** One of {@link STAFF_SUMMARY_CODES}. */
export type StaffSummaryCode = (typeof STAFF_SUMMARY_CODES)[number];

/** One of {@link STAFF_NOTIFICATION_CODES}. */
export type StaffNotificationCode = (typeof STAFF_NOTIFICATION_CODES)[number];

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
        code: { type: String, enum: NOTIFICATION_CODES, required: true },
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
