import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { productSchema } from "./products";
import type { Order, Product } from "@api/api"

/**
 * Same as ICartItem in ./users.ts,
 * but instead of only productId I store the entire product data.
 * If the product data change, it must not change for the order.
 */
export interface IOrderProduct {
    product: Product;
    quantity: number;
}

/**
 * Order Document interface.
 * Intentionally overrides the API-generated Order type's 'userId' (ObjectId vs string),
 * 'items' (renamed to 'products' in the Mongoose schema) and 'status' (plain string for
 * Mongoose schema compatibility) so that the Mongoose schema definition and the TypeScript
 * types stay in sync.
 */
export interface IOrderDocument extends Omit<Order, 'id' | 'userId' | 'items' | 'status'>, Document {
    userId: Types.ObjectId;
    products: IOrderProduct[];
    /** Order lifecycle status — plain string for schema compatibility with StatusEnum values. */
    status: string;
}

/**
 * Order Document model type.
 * Business logic (search, getAll) is now handled by the
 * service layer (src/services/orders.ts) and repository layer
 * (src/repositories/orders.ts).
 */
export type IOrderModel = Model<IOrderDocument, unknown, unknown>;

/**
 *
 */
export const orderSchema = new Schema<IOrderDocument>({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
    },
    email: {
        type: String,
        required: true
    },
    products: [{
        product: productSchema,
        quantity: {
            type: Number,
            required: true
        }
    }],
    status: {
        type: String,
        enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending',
    },
    notes: {
        type: String,
    },
}, {
    // Automatically manages createdAt and updatedAt timestamps
    timestamps: true
});

export default model<IOrderDocument, IOrderModel>('Order', orderSchema);