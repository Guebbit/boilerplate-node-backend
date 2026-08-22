import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { PaymentStatus } from '@types';

/**
 * Payment Model
 *
 * One payment document per order, made a database fact by `unique` on `orderId` — the same
 * discipline as the cart's and wishlist's one-per-user. A retry after a decline re-confirms the
 * SAME document rather than minting a second one, so "what happened to the money on this order"
 * is always one row with one status.
 *
 * The status vocabulary is the provider-facing lifecycle, deliberately smaller than a real
 * PSP's: `requires_confirmation` (intent created, nobody has paid), `succeeded`, `declined`
 * (retryable — the confirm endpoint accepts it again), `refunded` (terminal). The ORDER's
 * status is the customer-facing one; this document records how the money got there.
 *
 * The four words come from `PaymentStatus` in the contract — the schema `Payment.status` declares
 * — so the collection's `enum` and the wire cannot disagree. Same move as `orders`' `OrderStatus`.
 */

/**
 * Payment Document interface.
 */
export interface PaymentDocument extends Document {
    orderId: Types.ObjectId;
    userId: Types.ObjectId;
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
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
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
 * Normalizes a serialized payment: `_id` → `id`, drops `__v`. Owed to the base factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/base-repository).
 */
export const applyPaymentTransform = applySerialization(paymentSchema);

/**
 * Model
 */
export const paymentModel = model<PaymentDocument, PaymentModel>('Payment', paymentSchema);
