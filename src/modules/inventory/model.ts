import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * Stock Movement Model
 *
 * An append-only ledger: every row is one signed change to one product's shelf count, with the
 * WHY attached. The product's `stock` field stays authoritative — the ledger EXPLAINS, it never
 * computes — so a missed row (this module disabled for a while, say) degrades to a gap in the
 * story, not a wrong shelf count. No update path exists on purpose; a wrong row is corrected by
 * the next movement, the way accountants do it.
 */

export const MOVEMENT_REASONS = ['order', 'order-cancelled', 'adjustment', 'restock'] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/**
 * Stock Movement Document interface.
 */
export interface StockMovementDocument extends Document {
    productId: Types.ObjectId;
    /** Signed: a sale is negative, a return or restock positive. */
    delta: number;
    reason: MovementReason;
    /** What caused it, when something did — the order, typically. */
    reference?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Stock Movement Document model type. Queries live in `./repository`, rules in `./service`. */
export type StockMovementModel = Model<StockMovementDocument>;

export const stockMovementSchema = new Schema<StockMovementDocument>(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        delta: {
            type: Number,
            required: true
        },
        reason: {
            type: String,
            enum: MOVEMENT_REASONS,
            required: true
        },
        reference: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

// The one question the ledger answers is "what happened to THIS product, latest first".
stockMovementSchema.index({ productId: 1, createdAt: -1 });

/**
 * Normalizes a serialized movement: `_id` → `id`, drops `__v`. Owed to the base factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/base-repository).
 */
export const applyStockMovementTransform = applySerialization(stockMovementSchema);

/**
 * Model
 */
export const stockMovementModel = model<StockMovementDocument, StockMovementModel>(
    'StockMovement',
    stockMovementSchema
);
