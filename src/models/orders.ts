import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { productSchema, applyProductTransform } from './products';
import type { IProductDocument } from './products';
import { OrderStatus } from '@types';
import type { Order } from '@types';

/**
 * A single item stored inside an order document.
 * Uses IProductDocument (or ObjectId before populate) rather than the OpenAPI
 * OrderItem class, because Mongoose embeds the product snapshot directly.
 */
export interface IOrderDocumentItem {
    product: IProductDocument | Types.ObjectId;
    quantity: number;
}

/**
 * Order Document interface.
 * Intentionally overrides the API-generated Order type's 'userId' (ObjectId vs string),
 * 'items' (embedded IOrderDocumentItem instead of OpenAPI OrderItem), and 'status'.
 */
export interface IOrderDocument
    extends
        Omit<Order, 'id' | 'userId' | 'status' | 'total' | 'items' | 'createdAt' | 'updatedAt'>,
        Document {
    userId: Types.ObjectId;
    status: OrderStatus;
    notes?: string;
    items: IOrderDocumentItem[];
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Order Document model type.
 * Business logic (search, getAll) is now handled by the
 * service layer (src/services/orders.ts) and repository layer
 * (src/repositories/orders.ts).
 */
export type IOrderModel = Model<IOrderDocument, unknown, unknown>;

/**
 * Schema for a single embedded order item.
 * `_id: false` — OpenAPI's OrderItem is `{product, quantity}` only
 * (`additionalProperties: false`), so items don't need their own id.
 */
const orderItemSchema = new Schema(
    {
        product: productSchema,
        quantity: {
            type: Number,
            required: true
        }
    },
    { _id: false }
);

/**
 * Mongoose schema for persisted order documents.
 */
export const orderSchema = new Schema<IOrderDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        items: [orderItemSchema],
        status: {
            type: String,
            enum: Object.values(OrderStatus),
            default: OrderStatus.pending
        },
        notes: {
            type: String
        }
    },
    {
        // Automatically manages createdAt and updatedAt timestamps
        timestamps: true
    }
);

/**
 * Normalizes a serialized order: `_id` → `id`, drops `__v`, strips any
 * leftover `_id` on embedded items (pre-existing documents saved before
 * `orderItemSchema`'s `_id: false` took effect still carry one at the BSON
 * level), and recursively normalizes the embedded product snapshot.
 * Exported so aggregate results (which bypass `toJSON`) can be mapped
 * through the same logic — see @services/orders `getAll`/`search`/`getById`.
 */
export const applyOrderTransform = (
    serialized: Record<string, unknown>
): Record<string, unknown> => {
    if (serialized._id) {
        serialized.id = serialized._id.toString();
        delete serialized._id;
    }
    delete serialized.__v;

    if (Array.isArray(serialized.items))
        for (const item of serialized.items as Record<string, unknown>[]) {
            delete item._id;
            if (item.product && typeof item.product === 'object')
                applyProductTransform(item.product as Record<string, unknown>);
        }

    return serialized;
};

orderSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_document, serialized) =>
        applyOrderTransform(serialized as unknown as Record<string, unknown>)
});

/**
 * Mongoose model for order CRUD operations.
 */
export const orderModel = model<IOrderDocument, IOrderModel>('Order', orderSchema);
