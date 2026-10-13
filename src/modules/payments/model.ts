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
import { moneyPath, moneyPlugin } from '@infrastructure/persistence/money-field';
import {
    PaymentStatus,
    PaymentMethod,
    RefundFailureReason,
    RefundReason,
    RefundStatus
} from '@types';

/**
 * One returned product line a refund pays back — Shopify's `refund_line_items`, reduced to what a
 * credit note needs to find the line's VAT rate. Plain ids: `payments` knows nothing of `returns`
 * or `invoicing`.
 */
export interface RefundLine {
    /** The product the order line was for. */
    productId: string;
    /** How many of its units come back. */
    quantity: number;
}

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
    /**
     * The return this refund pays for, when `reason` is `return` — how `returns` finds the return
     * to close once the refund lands, even when it lands later (a sweep retried it). A plain id,
     * not a reference: `payments` knows nothing of `returns`.
     */
    returnId?: string;
    /**
     * The goods this refund pays back, when it pays for specific ones (a return). Absent for a
     * goodwill or cancellation refund. `invoicing` credits these lines at their own VAT rates.
     * Never published: it is the credit note's input, not a client's.
     */
    lines?: RefundLine[];
    /** The delivery cost inside `amount`, beside `lines` — a decimal. Never published. */
    shipping?: number;
    /** The provider's id for the refund, once it answered. Staff only, like `providerRef`. */
    providerRefundRef?: string;
    /**
     * Why the provider last refused, as a closed code. Staff only. The provider's own wording is
     * logged, never stored: it can carry anything.
     */
    failureReason?: RefundFailureReason;
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
    createdAt?: Date;
    updatedAt?: Date;
}

/** Payment Document model type. Queries live in `./repository`, rules in `./service`. */
export type PaymentModel = Model<PaymentDocument>;

/** One refund attempt, embedded. Addressed by its own `_id` — the settle and fail writes match on it. */
const refundSchema = new Schema<RefundRecord>(
    {
        amount: moneyPath({ required: true, nonNegative: true }),
        currency: { type: String, required: true },
        status: {
            type: String,
            enum: Object.values(RefundStatus),
            default: RefundStatus.pending
        },
        reason: { type: String, enum: Object.values(RefundReason), required: true },
        idempotencyKey: { type: String, required: true },
        returnId: { type: String },
        lines: {
            type: [
                new Schema<RefundLine>(
                    {
                        productId: { type: String, required: true },
                        quantity: { type: Number, required: true, min: 1 }
                    },
                    { _id: false }
                )
            ],
            default: undefined
        },
        shipping: moneyPath({ nonNegative: true }),
        providerRefundRef: { type: String },
        failureReason: { type: String, enum: Object.values(RefundFailureReason) },
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
        amount: moneyPath({ required: true, nonNegative: true }),
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
        amountRefunded: moneyPath({ required: true, nonNegative: true, default: 0 }),
        refunds: {
            type: [refundSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

/**
 * Money is stored as Decimal128 and a lean read hands numbers back — see `@infrastructure/persistence/money-field`.
 */
paymentSchema.plugin(moneyPlugin);

// The staff list: newest first, optionally by status.
paymentSchema.index({ createdAt: -1 }, { name: 'payments_createdAt' });
paymentSchema.index({ status: 1, createdAt: -1 }, { name: 'payments_status_createdAt' });
// The Refunds tab and the needs-attention read, which `$match` on a refund's status first.
paymentSchema.index(
    { 'refunds.status': 1, 'refunds.createdAt': -1 },
    { name: 'payments_refunds_status_createdAt' }
);

/**
 * The keys of an embedded refund the serializer strips. `providerRefundRef` and `failureReason` are
 * put back for staff by `presenter.ts`; the rest never reach any client.
 */
const REFUND_INTERNAL_KEYS = [
    '_id',
    'providerRefundRef',
    'idempotencyKey',
    'failureReason',
    'lines',
    'shipping'
] as const;

/**
 * A refund record as the contract publishes it to a payer: `_id` → `id`, and the provider-facing
 * bookkeeping (its own refund id, the idempotency key, its failure reason) and the credit note's
 * input left behind.
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
 * `providerRef` is omitted here rather than left to each caller: it is internal bookkeeping (a
 * provider handle) no client operation reads, and the contract declares
 * `additionalProperties: false`, so a serializer that let it through would fail the spec as well
 * as publish it.
 */
export const applyPaymentTransform = applySerialization(paymentSchema, {
    omit: ['providerRef'],
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
