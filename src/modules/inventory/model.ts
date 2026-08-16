import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { StockMovementReason } from '@types';
import type { StockMovement } from '@types';
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

/**
 * Every reason the contract declares, in the array shape Mongoose's `enum:` wants.
 *
 * Read off the generated enum rather than retyped. The four literals used to be written out here,
 * which meant `openapi.yaml` and this schema each had an opinion about what a reason is and nothing
 * compared them — a fifth reason added to the contract would have been rejected at write time by a
 * validator nobody thought to update.
 */
export const MOVEMENT_REASONS = Object.values(StockMovementReason);

export type MovementReason = StockMovementReason;

/**
 * Stock Movement Document interface.
 *
 * The field list comes from the contract's `StockMovement`, the same way `ProductDocument` takes
 * its own from `Product`. Only what storage genuinely disagrees with the wire about is restated:
 * `productId` is a real `ObjectId` here, and the timestamps are `Date`s rather than ISO strings.
 */
export interface StockMovementDocument
    extends Omit<StockMovement, 'id' | 'productId' | 'createdAt' | 'updatedAt'>, Document {
    productId: Types.ObjectId;
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
