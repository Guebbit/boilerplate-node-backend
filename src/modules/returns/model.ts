/**
 * @module
 * A Return — the request to send goods back, and where it stands. One document per request, keyed
 * by `orderId` and NEVER by `userId`: erasing an account then leaves this record with no personal
 * link (`orders`' own `detachUserId` breaks the order's), which is the Art. 17(3)(b)/(e) retention
 * exemption `invoicing` already documents — a return is the same kind of legal/accounting record.
 *
 * Lifecycle: `requested → approved → received → closed`, or `requested → declined`. A withdrawal
 * (`reason: withdrawal`) is a right, not a request, so it is born `approved`. See
 * `docs/modules/returns.md`.
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import type { ReturnReason, ReturnStatus } from './domain';

/** Who pays to send the goods back — frozen when the return is opened, from the shop's config. */
export type ReturnPostagePayer = 'consumer' | 'shop';

/** One line of a return — a snapshot of what is coming back, so it reads the same later. */
export interface ReturnLine {
    /** The catalogue product this line of the order was for. */
    productId: Types.ObjectId;
    /** How many units of it come back — at most what the order held, less what other returns took. */
    quantity: number;
    /** The product's title as the order froze it. */
    title: string;
    /** The gross unit price the order froze — what a refund of this line is computed from. */
    unitPrice: number;
}

/** Return Document interface. */
export interface ReturnDocument extends Document {
    orderId: Types.ObjectId;
    /** The order's human number, copied so a staff queue reads without a join. */
    orderNumber?: string;
    /** ISO-4217 code of the order's own currency. */
    currency: string;
    status: ReturnStatus;
    reason: ReturnReason;
    /** What the customer wrote. Free text — never trusted, never rendered as HTML. */
    note?: string;
    lines: ReturnLine[];
    /** Frozen from `NODE_RETURN_POSTAGE_PAYER` at creation: what the customer was told beforehand. */
    returnPostage: ReturnPostagePayer;
    /** Why staff declined. Present only on a `declined` return. */
    declineReason?: string;
    /** When staff approved or declined it — or, for a withdrawal, when it was opened approved. */
    decidedAt?: Date;
    /** When the goods arrived and went back on sale. */
    receivedAt?: Date;
    /**
     * An amount staff kept back for handling that lowered the goods' value (Art. 14(2)) — entered
     * when the goods were received. Decimal, in the return's currency.
     */
    handlingDeduction?: number;
    /** What the customer is owed for this return, decided when the goods were received. */
    refundAmount?: number;
    /** When the money went back and the return was finished. */
    closedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Return model type. Queries live in `./repository`, rules in `./services`. */
export type ReturnModel = Model<ReturnDocument>;

/** One returned line, embedded — `_id: false`, nothing addresses a line by its own id. */
const returnLineSchema = new Schema<ReturnLine>(
    {
        productId: { type: Schema.Types.ObjectId, required: true },
        quantity: { type: Number, required: true, min: 1 },
        title: { type: String, required: true },
        unitPrice: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

/** Mongoose schema for persisted returns. */
export const returnSchema = new Schema<ReturnDocument>(
    {
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
        orderNumber: { type: String },
        currency: { type: String, required: true },
        status: {
            type: String,
            enum: ['requested', 'approved', 'declined', 'received', 'closed'],
            default: 'requested'
        },
        reason: {
            type: String,
            enum: ['withdrawal', 'defective', 'wrong_item', 'other'],
            required: true
        },
        note: { type: String, maxlength: 1000 },
        lines: { type: [returnLineSchema], required: true },
        returnPostage: { type: String, enum: ['consumer', 'shop'], required: true },
        declineReason: { type: String, maxlength: 500 },
        decidedAt: { type: Date },
        receivedAt: { type: Date },
        handlingDeduction: { type: Number, min: 0 },
        refundAmount: { type: Number, min: 0 },
        closedAt: { type: Date }
    },
    { timestamps: true }
);

// Backs "every return on this order" — the quantity check when a new one is opened, the customer's
// own view, and `collect` for the account export.
returnSchema.index({ orderId: 1, createdAt: 1 }, { name: 'returns_orderId_createdAt' });

// Backs the staff queue: a status filter, oldest waiting first.
returnSchema.index({ status: 1, createdAt: 1 }, { name: 'returns_status_createdAt' });

/**
 * Normalizes a serialized return: `_id` → `id`, drops `__v`. Owed to the repository factory's lean
 * reads.
 */
export const applyReturnTransform = applySerialization(returnSchema);

/** The compiled return model, registered as `Return`. */
export const returnModel = model<ReturnDocument, ReturnModel>('Return', returnSchema);
