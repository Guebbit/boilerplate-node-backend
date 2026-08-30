import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { productSchema, applyProductTransform } from '@modules/products';
import type { ProductSnapshot } from '@modules/products';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { sumLineItems, orderTotal, type LineItem } from './domain/totals';
import { OrderStatus } from '@types';
import type { Order } from '@types';

/**
 * A single item stored inside an order document.
 *
 * Uses `ProductSnapshot` rather than the OpenAPI `OrderItem`, because Mongoose embeds the product
 * directly — and rather than `ProductDocument`, because what is embedded is a subdocument with none
 * of `Document`'s methods on it. Claiming the stronger type meant nothing could produce one without
 * a cast: this service did it twice and the fixtures once, each over a comment explaining that the
 * value was fine really.
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
 * Order Document interface.
 * Intentionally overrides the API-generated Order type's 'userId' (ObjectId vs string),
 * 'items' (embedded OrderDocumentItem instead of OpenAPI OrderItem), and 'status'.
 *
 * `totalItems`, `totalQuantity` and `totalPrice` are omitted rather than inherited: they are
 * required on the wire but never persisted — `applyOrderTransform` derives them at serialization
 * time — so declaring them here would claim a stored field that does not exist.
 *
 * `deletedAt` is omitted and redeclared for the same reason it is in `ProductDocument` and
 * `User`: the contract types it as an ISO string, the schema stores a `Date`.
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
         * The shipping choice, frozen at checkout like everything else on an order: the method's
         * id and what it COST THEN — a later change to the delivery module's rates cannot
         * re-price history.
         *
         * `shippingMethod` is absent when no method was chosen — shipping is not required to buy,
         * exactly like the address. `shippingCost` is NOT: it defaults to 0, because what the
         * customer owes for shipping is always a number, and an order that chose nothing owes
         * nothing. That is what keeps `orderTotal`'s tolerance of an absent value a defence
         * against a malformed document rather than a live contract with the schema.
         *
         * `db/migrations/20260820140000-order-shipping-cost.js` backfills the rows written before
         * this default existed.
         */
        shippingMethod: {
            type: String
        },
        shippingCost: {
            type: Number,
            min: 0,
            default: 0
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
