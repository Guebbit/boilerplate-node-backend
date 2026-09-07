/**
 * @module
 * One payment document per order, made a database fact by `unique` on `orderId` — a retry after a
 * decline re-confirms the SAME document rather than minting a second one. The status vocabulary
 * (`requires_confirmation`, `requires_action` and `processing` in flight, `succeeded`, `declined`
 * retryable, `refunded` terminal) is the provider-facing lifecycle, distinct from the order's
 * customer-facing status, and comes from `PaymentStatus` in the contract so the enum and the wire
 * cannot disagree.
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { PaymentStatus } from '@types';

/**
 * Payment Document interface.
 */
export interface PaymentDocument extends Document {
    orderId: Types.ObjectId;
    /**
     * Absent once the account that made this payment has been erased — the same unset-not-delete
     * treatment as `orders`' `userId`. No PII to scrub beyond it: `cardLast4` is not a PAN, and
     * `amount`/`currency`/`provider` were never personal data.
     */
    userId?: Types.ObjectId;
    /** What the intent froze the price at — the order's total when the intent was created. */
    amount: number;
    /** ISO-4217, from `NODE_DEFAULT_CURRENCY`. Carried per document: config can change. */
    currency: string;
    status: PaymentStatus;
    /** Which provider implementation handled it — 'fake' in the demo, 'stripe' one day. */
    provider: string;
    /**
     * The provider's own id for this intent. The webhook's lookup key, which is why it is indexed
     * and unique: a delivery arrives naming this and nothing else, and two payments answering to
     * one reference would settle the wrong order.
     *
     * NOT published on the wire. It is the handle that operates on real money at the provider, and
     * a client has no operation that needs it — every endpoint here takes this API's own id.
     */
    providerRef?: string;
    /** The only card digits a payment system may remember. */
    cardLast4?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Payment Document model type. Queries live in `./repository`, rules in `./service`. */
export type PaymentModel = Model<PaymentDocument>;

export const paymentSchema = new Schema<PaymentDocument>(
    {
        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            unique: true
        },
        // Not `required` — erasure unsets it rather than deleting the payment.
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: Object.values(PaymentStatus),
            default: PaymentStatus.requires_confirmation
        },
        provider: {
            type: String,
            required: true
        },
        // Sparse: an intent exists for a moment before the provider has been asked for one, and
        // `unique` would otherwise collide every such document on `null`.
        providerRef: {
            type: String,
            unique: true,
            sparse: true
        },
        cardLast4: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

/**
 * Normalizes a serialized payment: `_id` → `id`, drops `__v`, and strips `providerRef`. Owed to the
 * repository factory for its lean reads (see `normalize` in
 * @infrastructure/persistence/create-repository).
 *
 * `providerRef` is omitted here rather than left to each caller: it is the handle that operates on
 * real money at the provider, no client has an operation that needs it — every endpoint takes this
 * API's own id — and the contract declares `additionalProperties: false`, so a serializer that let
 * it through would fail the spec as well as publish it.
 */
export const applyPaymentTransform = applySerialization(paymentSchema, {
    omit: ['providerRef']
});

/**
 * Model
 */
export const paymentModel = model<PaymentDocument, PaymentModel>('Payment', paymentSchema);

/** How long a processed webhook event id is remembered. Past any provider's retry window. */
const WEBHOOK_EVENT_RETENTION_DAYS = 30;

/**
 * One webhook delivery this application has already acted on.
 *
 * A provider retries a webhook until it gets a 2xx — for days — so the same event arrives many
 * times, and the conditional status writes in `service.ts` are only at-most-once for the STATUS.
 * Committing inventory and emitting `ORDER_STATUS_CHANGED` are not conditional on anything, so
 * without this ledger a retry re-fires them.
 */
export interface PaymentWebhookEventDocument extends Document {
    /** The provider's own event id — the thing that repeats across retries. */
    eventId: string;
    /** When it was first accepted; the TTL index reads this. */
    receivedAt: Date;
}

/** The ledger's model type. Its one query lives in `./repository`. */
export type PaymentWebhookEventModel = Model<PaymentWebhookEventDocument>;

export const paymentWebhookEventSchema = new Schema<PaymentWebhookEventDocument>({
    // `unique` is the whole mechanism: one insert either wins or is refused, where a read followed
    // by a write is a race two concurrent deliveries could both pass.
    eventId: {
        type: String,
        required: true,
        unique: true
    },
    receivedAt: {
        type: Date,
        required: true,
        default: () => new Date(),
        // mongod drops the row once it is older than the window, so the collection does not grow
        // forever for a guarantee that stops mattering as soon as the retries stop.
        expires: WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60
    }
});

export const paymentWebhookEventModel = model<
    PaymentWebhookEventDocument,
    PaymentWebhookEventModel
>('PaymentWebhookEvent', paymentWebhookEventSchema);
