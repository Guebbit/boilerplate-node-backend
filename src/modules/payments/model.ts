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
import { PaymentStatus, PaymentMethod } from '@types';

/** Why money went back — the vocabulary `RefundReason` in the contract publishes. */
export type RefundReason = 'cancellation' | 'goodwill' | 'return';

/** Where one refund attempt stands. `failed` is retryable: the sweep tries the same key again. */
export type RefundStatus = 'pending' | 'succeeded' | 'failed';

/**
 * One attempt to give money back — a record per attempt, the way Stripe keeps a `Refund` per
 * request. The payment's own `status` says whether it is fully returned; these say how, when and
 * how much each time.
 */
export interface RefundRecord {
    _id: Types.ObjectId;
    /** Decimal, in the payment's own currency — at most what was still refundable when it was opened. */
    amount: number;
    /** Copied from the payment at the time, so a record reads on its own. */
    currency: string;
    status: RefundStatus;
    reason: RefundReason;
    /**
     * What makes a retry of THIS refund safe at the provider: the same key returns the same refund
     * instead of returning the money twice. Never published.
     */
    idempotencyKey: string;
    /** The provider's id for the refund, once it answered. Never published, like `providerRef`. */
    providerRefundRef?: string;
    /** What the provider last said when it refused. Never published: it is the provider's wording. */
    lastError?: string;
    /** When the money was confirmed back, or (for a hand-paid one) reported back. */
    settledAt?: Date;
    createdAt: Date;
}

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
    /** Which provider implementation handled it — 'fake' in the demo, 'manual' by hand, 'stripe' one day. */
    provider: string;
    /**
     * The provider's own id for this intent. The webhook's lookup key, which is why it is indexed
     * and unique: a delivery arrives naming this and nothing else, and two payments answering to
     * one reference would settle the wrong order.
     *
     * NOT published on the wire. It is the handle that operates on real money at the provider, and
     * a client has no operation that needs it — every endpoint here takes this API's own id.
     *
     * Absent on a `manual` payment: there is no provider intent behind money recorded by hand.
     */
    providerRef?: string;
    /** The only card digits a payment system may remember. */
    cardLast4?: string;
    /** How the money moved. `card` for the intent path; the other three only from recording by hand. */
    method: PaymentMethod;
    /** A bank transaction id, a receipt number — set only by recording a payment by hand. */
    reference?: string;
    /** When the money actually arrived, as the admin reported it — set only by recording by hand. */
    receivedAt?: Date;
    /**
     * `true` once a refunded `manual` payment has had its money returned to the customer outside
     * this application — there is no provider to ask, so this is the operator's own record that it
     * was done by hand.
     */
    refundedByHand?: boolean;
    /**
     * Everything asked back so far, pending and succeeded both — Stripe's `amount_refunded`. It
     * counts a refund the moment it is opened, which is what stops two racing partial refunds
     * from returning more than the customer paid.
     */
    amountRefunded: number;
    /** One record per refund attempt, oldest first. */
    refunds: RefundRecord[];
    /**
     * Effects still owed for this payment's current `succeeded` write — hidden from the API, like
     * `providerRef`. Set in the SAME write that moves the payment to `succeeded`, so a crash
     * before the effect actually runs (today, only `commit`: taking the held stock) leaves a
     * durable note that it is still owed. `payments/services/effects.ts#retryPendingEffects`
     * finds these on a schedule and finishes or drops them; `settlement.ts` clears the field once
     * the effect has run or the order it was for is no longer payable.
     */
    pendingEffects?: PaymentEffect[];
    createdAt?: Date;
    updatedAt?: Date;
}

/** The one effect a `succeeded` write can still owe once it returns — see {@link PaymentDocument.pendingEffects}. */
export type PaymentEffect = 'commit';

/** Payment Document model type. Queries live in `./repository`, rules in `./service`. */
export type PaymentModel = Model<PaymentDocument>;

/** One refund attempt, embedded. Addressed by its own `_id` — the settle and fail writes match on it. */
const refundSchema = new Schema<RefundRecord>(
    {
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, required: true },
        status: { type: String, enum: ['pending', 'succeeded', 'failed'], default: 'pending' },
        reason: { type: String, enum: ['cancellation', 'goodwill', 'return'], required: true },
        idempotencyKey: { type: String, required: true },
        providerRefundRef: { type: String },
        lastError: { type: String },
        settledAt: { type: Date }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

/** Mongoose schema for persisted payment documents. */
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
        },
        method: {
            type: String,
            enum: Object.values(PaymentMethod),
            required: true
        },
        // Offline-only. Not `required`: a card payment has neither.
        reference: {
            type: String,
            maxlength: 120
        },
        receivedAt: {
            type: Date
        },
        // Offline-only, and only once refunded — see `refunds.ts`'s dispatch on `provider`.
        refundedByHand: {
            type: Boolean
        },
        amountRefunded: {
            type: Number,
            required: true,
            default: 0,
            min: 0
        },
        refunds: {
            type: [refundSchema],
            default: []
        },
        pendingEffects: {
            type: [String],
            enum: ['commit']
        }
    },
    {
        timestamps: true
    }
);

// Backs `effects.ts#retryPendingEffects`'s own scan: which payments still owe an effect, oldest
// first. `updatedAt` in the key (not just a query filter) is what lets the sweep skip a payment
// this same second's settlement is still in the middle of, without a second index for that alone.
paymentSchema.index(
    { pendingEffects: 1, updatedAt: 1 },
    { name: 'payments_pendingEffects_updatedAt' }
);

/** The keys of an embedded refund that never reach the wire. */
const REFUND_INTERNAL_KEYS = ['_id', 'providerRefundRef', 'idempotencyKey', 'lastError'] as const;

/**
 * A refund record as the contract publishes it: `_id` → `id`, and the provider-facing bookkeeping
 * (its own refund id, the idempotency key, its error wording) left behind.
 *
 * @param refund - one embedded refund, as a plain object
 * @returns the same record without the fields no client operation reads
 */
const wireRefund = (refund: Record<string, unknown>): Record<string, unknown> => {
    const wire: Record<string, unknown> = { ...refund, id: String(refund._id ?? refund.id) };
    for (const key of REFUND_INTERNAL_KEYS)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- stripping caller-named keys from a plain record is the whole job
        delete wire[key];
    return wire;
};

/**
 * Normalizes a serialized payment: `_id` → `id`, drops `__v`, and strips `providerRef`. Owed to the
 * repository factory for its lean reads (see `normalize` in
 * @infrastructure/persistence/create-repository).
 *
 * `providerRef` and `pendingEffects` are omitted here rather than left to each caller: both are
 * internal bookkeeping (a provider handle, a retry marker) no client operation reads, and the
 * contract declares `additionalProperties: false`, so a serializer that let either through would
 * fail the spec as well as publish it.
 */
export const applyPaymentTransform = applySerialization(paymentSchema, {
    omit: ['providerRef', 'pendingEffects'],
    after: (serialized) => {
        // The embedded refunds get the same treatment a top-level document does, by hand: the lean
        // path never runs the subschema's own transform, and the `toJSON` path runs it on
        // documents already turned to plain objects — one loop serves both.
        if (Array.isArray(serialized.refunds))
            serialized.refunds = serialized.refunds.map((refund: Record<string, unknown>) =>
                wireRefund(refund)
            );
    }
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

/** Mongoose schema for the webhook ledger — see {@link PaymentWebhookEventDocument}. */
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

/** Mongoose model for the webhook ledger — claimed and released by `./repository`. */
export const paymentWebhookEventModel = model<
    PaymentWebhookEventDocument,
    PaymentWebhookEventModel
>('PaymentWebhookEvent', paymentWebhookEventSchema);
