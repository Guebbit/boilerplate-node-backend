import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { productSchema, applyProductTransform } from './products';
import type { IProductDocument } from './products';
import { sumLineItems, type ILineItem } from '@core/totals';
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
 *
 * `totalItems`, `totalQuantity` and `totalPrice` are omitted rather than inherited: they are
 * required on the wire but never persisted — `applyOrderTransform` derives them at serialization
 * time — so declaring them here would claim a stored field that does not exist.
 */
export interface IOrderDocument
    extends
        Omit<
            Order,
            | 'id'
            | 'userId'
            | 'status'
            | 'items'
            | 'totalItems'
            | 'totalQuantity'
            | 'totalPrice'
            | 'createdAt'
            | 'updatedAt'
        >,
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
 * Business logic lives in the service layer (src/services/orders.ts); queries live in the
 * repository layer (src/repositories/orders.ts).
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
 * through the same logic — see `normalize` in @repositories/base.
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

    applyOrderTotals(serialized);

    return serialized;
};

/**
 * Derives `totalItems`, `totalQuantity` and `totalPrice` from `items`.
 *
 * Done at the single serialization point every order response passes through, so the list, both
 * `getById` role branches, create and update all agree — which is what lets `openapi.yaml` mark
 * the three fields required.
 *
 * Note the name collision with `PaginationMeta.totalItems`: there it is the number of orders
 * matching a search, here it is the number of line items in one order. Pre-existing; unrelated.
 */
const applyOrderTotals = (serialized: Record<string, unknown>) => {
    const { count, quantity, price } = sumLineItems(
        Array.isArray(serialized.items) ? (serialized.items as ILineItem[]) : []
    );

    serialized.totalItems = count;
    serialized.totalQuantity = quantity;
    serialized.totalPrice = price;
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
