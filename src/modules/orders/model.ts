import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { productSchema, applyProductTransform } from '@modules/products';
import type { IProductDocument } from '@modules/products';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { sumLineItems, type ILineItem } from './domain/totals';
import { OrderStatus } from '@types';
import type { Order } from '@types';

/**
 * A single item stored inside an order document.
 * Uses IProductDocument (or ObjectId before populate) rather than the OpenAPI
 * OrderItem class, because Mongoose embeds the product snapshot directly.
 */
export interface IOrderDocumentItem {
    /**
     * The product snapshot, embedded.
     *
     * Not a reference and never an `ObjectId`: `orderItemSchema` declares `product: productSchema`
     * with no `ref`, so there is nothing for `populate()` to resolve and the un-joined case cannot
     * occur. An order must keep what was bought, not what the catalogue says today.
     */
    product: IProductDocument;
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
 *
 * `deletedAt` is omitted and redeclared for the same reason it is in `IProductDocument` and
 * `IUser`: the contract types it as an ISO string, the schema stores a `Date`.
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
            | 'deletedAt'
        >,
        Document {
    userId: Types.ObjectId;
    status: OrderStatus;
    notes?: string;
    items: IOrderDocumentItem[];
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
}

/**
 * Order Document model type.
 * Business logic lives in the service (`./service`); queries live in the repository
 * (`./repository`).
 */
export type IOrderModel = Model<IOrderDocument, unknown, unknown>;

/**
 * Schema for a single embedded order item.
 * `_id: false` — OpenAPI's OrderItem is `{product, quantity}` only
 * (`additionalProperties: false`), so items don't need their own id.
 */
const orderItemSchema = new Schema(
    {
        /*
         * `excludeIndexes` because Mongoose copies an embedded schema's indexes onto whatever
         * embeds it. Without it, every index the catalogue declares would reappear here pointed
         * at `items.product.*`, so each order write would maintain a set of indexes describing
         * how the catalogue is searched — which is nothing anyone asks of an order. These copies
         * are frozen history; they are read as part of the order that owns them and never
         * searched on their own.
         */
        product: { type: productSchema, excludeIndexes: true },
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
        },
        /*
         * Set when an order is soft-deleted. Orders carry no `active` flag, so unlike a product
         * this is the only fact that hides one: `visibleScope` requires its absence, and an admin
         * passes no scope at all, which is how a soft-deleted order stays readable to them.
         */
        deletedAt: {
            type: Date
        }
    },
    {
        // Automatically manages createdAt and updatedAt timestamps
        timestamps: true
    }
);

/*
 * Indexes.
 *
 * Declared on the schema, which makes this the one place that decides what is indexed here.
 *
 * The names are given rather than derived: Mongo identifies an index by its name as much as by
 * its key, so asking for a key it already holds under a different name fails at startup instead
 * of doing nothing. These are the names the databases already carry.
 */
/* "My orders" lookups, newest first. */
orderSchema.index({ userId: 1, createdAt: -1 }, { name: 'orders_userId_createdAt' });
/* An order remembers the address it was placed from, which is how guests' orders are found. */
orderSchema.index({ email: 1 }, { name: 'orders_email' });
/* Non-admin reads exclude soft-deleted rows (`visibleScope` in `./repository`). */
orderSchema.index({ userId: 1, deletedAt: 1 }, { name: 'orders_userId_deletedAt' });

/**
 * Strips any leftover `_id` on embedded items (pre-existing documents saved before
 * `orderItemSchema`'s `_id: false` took effect still carry one at the BSON level), and
 * recursively normalizes the embedded product snapshot.
 */
const applyOrderItems = (serialized: Record<string, unknown>) => {
    if (!Array.isArray(serialized.items)) return;

    for (const item of serialized.items as Record<string, unknown>[]) {
        delete item._id;
        if (item.product && typeof item.product === 'object')
            applyProductTransform(item.product as Record<string, unknown>);
    }
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

/**
 * Normalizes a serialized order: the shared `_id` → `id` and `__v` removal, plus this
 * collection's own two jobs — cleaning up the embedded items and deriving the totals.
 * Exported so aggregate results (which bypass `toJSON`) can be mapped
 * through the same logic — see `normalize` in @infrastructure/persistence/base-repository.
 */
export const applyOrderTransform = applySerialization(orderSchema, {
    after: (serialized) => {
        applyOrderItems(serialized);
        applyOrderTotals(serialized);
    }
});

/**
 * Mongoose model for order CRUD operations.
 */
export const orderModel = model<IOrderDocument, IOrderModel>('Order', orderSchema);
