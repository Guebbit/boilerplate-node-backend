/**
 * @module
 * The order Mongoose schema and the serialization transform that derives its wire-only totals.
 * An order embeds the product SNAPSHOT it was bought against (`productSchema`, no `ref`) rather
 * than referencing the live catalogue row, since a later product edit must not rewrite purchase
 * history. `totalItems`, `totalQuantity` and `totalPrice` are never stored — `applyOrderTransform`
 * derives them from `items` at the single serialization point every response passes through,
 * letting the contract mark them required. See: docs/modules/orders.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { productSchema, applyProductTransform } from '@modules/products';
import type { ProductSnapshot } from '@modules/products';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { sumLineItems, orderTotal, type LineItem } from './domain/totals';
import { OrderStatus } from '@types';
import type { Order } from '@types';

/**
 * A single item stored inside an order document. Uses `ProductSnapshot` rather than OpenAPI's
 * `OrderItem`, since Mongoose embeds the product directly — and not `ProductDocument`, since
 * what's embedded is a subdocument with none of `Document`'s methods on it.
 */
export interface OrderDocumentItem {
    /**
     * The product snapshot, embedded.
     *
     * Not a reference and never an `ObjectId`: `orderItemSchema` declares `product: productSchema`
     * with no `ref`, so there is nothing for `populate()` to resolve and the un-joined case cannot
     * occur. An order must keep what was bought, not what the catalogue says today.
     */
    product: ProductSnapshot;
    quantity: number;
}

/**
 * Order Document interface: overrides the generated `Order`'s `userId`/`items`/`status`, and
 * redeclares `deletedAt` as `Date` (the contract types it as an ISO string). `totalItems`,
 * `totalQuantity` and `totalPrice` are omitted rather than inherited — required on the wire but
 * never persisted, so declaring them here would claim a stored field that doesn't exist.
 */
export interface OrderDocument
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
    items: OrderDocumentItem[];
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
}

/**
 * Order Document model type.
 * Business logic lives in the service (`./service`); queries live in the repository
 * (`./repository`).
 */
export type OrderModel = Model<OrderDocument, unknown, unknown>;

/**
 * Schema for a single embedded order item.
 * `_id: false` — OpenAPI's OrderItem is `{product, quantity}` only
 * (`additionalProperties: false`), so items don't need their own id.
 */
const orderItemSchema = new Schema(
    {
        /*
         * `excludeIndexes`: without it, Mongoose copies the catalogue's indexes onto every
         * order's `items.product.*` — frozen history that is never searched on its own.
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
export const orderSchema = new Schema<OrderDocument>(
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
         * The shipping choice, frozen at checkout: the method's id and what it COST THEN, so a
         * later rate change can't re-price history. Both fields are absent together when no
         * method was chosen (free-above-threshold or a genuinely free method like `pickup` still
         * freezes `shippingMethod` — it is present, `shippingCost` is legitimately `0`; only "no
         * method at all" leaves both unset) — `orderTotal` already tolerates an absent value.
         */
        shippingMethod: {
            type: String
        },
        shippingCost: {
            type: Number,
            min: 0
        },
        /*
         * The address the order ships to — a SNAPSHOT, exactly like the product snapshots in
         * `items`: an order keeps where it was going, not what the address book says today.
         * Absent on orders that predate the book and on checkouts by users who keep none;
         * `_id: false` because the shared `OrderAddress` schema is `additionalProperties: false`.
         */
        shippingAddress: {
            type: new Schema(
                {
                    fullName: { type: String, required: true },
                    street: { type: String, required: true },
                    city: { type: String, required: true },
                    zip: { type: String, required: true },
                    country: { type: String, required: true },
                    phone: { type: String }
                },
                { _id: false }
            )
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
 * Indexes, declared on the schema so this is the one place deciding what's indexed. Names are
 * given rather than derived — Mongo identifies an index by name, so reusing a key under a new
 * name fails at startup instead of silently doing nothing; these are the names the databases
 * already carry.
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
 * Derives `totalItems`, `totalQuantity` and `totalPrice` from `items`, at the single
 * serialization point every response passes through, so list, both `getById` branches, create
 * and update all agree. (Name collision with `PaginationMeta.totalItems` — unrelated,
 * pre-existing.)
 */
const applyOrderTotals = (serialized: Record<string, unknown>) => {
    const items = Array.isArray(serialized.items) ? (serialized.items as LineItem[]) : [];
    const { count, quantity } = sumLineItems(items);

    serialized.totalItems = count;
    serialized.totalQuantity = quantity;
    // What the customer owes, from the one function that decides it — the same call the payment
    // intent and the confirmation email make, so the three cannot quote different numbers.
    serialized.totalPrice = orderTotal({ items, shippingCost: serialized.shippingCost });
};

/**
 * Normalizes a serialized order: the shared `_id` → `id` and `__v` removal, plus this
 * collection's own two jobs — cleaning up the embedded items and deriving the totals.
 * Exported so aggregate results (which bypass `toJSON`) can be mapped
 * through the same logic — see `normalize` in @infrastructure/persistence/create-repository.
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
export const orderModel = model<OrderDocument, OrderModel>('Order', orderSchema);
