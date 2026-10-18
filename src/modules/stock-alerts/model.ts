/**
 * @module
 * A back-in-stock request: one row per user and product, used once. Its life is the buyer's
 * consent for a single mail, so it carries nothing but who asked, about what, and when.
 *
 * See: docs/modules/stock-alerts.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** One stored request. */
export interface StockAlertDocument extends Document {
    userId: Types.ObjectId;
    productId: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Stock alert model type. Queries live in `./repository`, rules in `./service`. */
export type StockAlertModel = Model<StockAlertDocument>;

/** Mongoose schema: the unique pair is what makes asking twice the same request. */
export const stockAlertSchema = new Schema<StockAlertDocument>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true }
    },
    { timestamps: true }
);

// One request per user and product: an upsert on this pair cannot create a second.
stockAlertSchema.index({ userId: 1, productId: 1 }, { unique: true });
// The signal finds everyone waiting for one product.
stockAlertSchema.index({ productId: 1 });

/** `_id` → `id`, dates to ISO strings. */
export const applyStockAlertTransform = applySerialization(stockAlertSchema);

/** Stock alert model entrypoint. */
export const stockAlertModel = model<StockAlertDocument, StockAlertModel>(
    'StockAlert',
    stockAlertSchema
);
