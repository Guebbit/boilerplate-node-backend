/**
 * @module
 * One payment document per order, made a database fact by `unique` on `orderId` — a retry after a
 * decline re-confirms the SAME document rather than minting a second one. The status vocabulary
 * (`requires_confirmation`, `succeeded`, `declined` retryable, `refunded` terminal) is the
 * provider-facing lifecycle, distinct from the order's customer-facing status, and comes from
 * `PaymentStatus` in the contract so the enum and the wire cannot disagree.
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
        cardLast4: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

/**
 * Normalizes a serialized payment: `_id` → `id`, drops `__v`. Owed to the repository factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/create-repository).
 */
export const applyPaymentTransform = applySerialization(paymentSchema);

/**
 * Model
 */
export const paymentModel = model<PaymentDocument, PaymentModel>('Payment', paymentSchema);
