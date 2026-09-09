/**
 * @module
 * The order Mongoose schema and the serialization transform that derives its wire-only totals.
 * An order embeds the product SNAPSHOT it was bought against (`orderLineProductSchema`, no `ref`,
 * and NOT `productSchema` — see the note there) rather than referencing the live catalogue row,
 * since a later product edit must not rewrite purchase history. `totalItems`, `totalQuantity` and
 * `totalPrice` are never stored — `applyOrderTransform` derives them from `items` at the single
 * serialization point every response passes through, letting the contract mark them required.
 *
 * The snapshot is not just a copy of the product row: `title`/`description` are that product's
 * text as resolved into the buyer's language at order-creation time, then frozen — each item
 * carries the `locale` that resolution happened in, so a later read reproduces what was actually
 * bought rather than re-resolving against whoever happens to be reading it. See
 * `./services/snapshot`.
 * See: docs/modules/orders.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import type { ProductSnapshot } from '@modules/products';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { sumLineItems, orderTotal, type LineItem } from './domain/totals';
import { OrderStatus } from '@types';
import type { Order } from '@types';

/**
 * A single item stored inside an order document. Uses `ProductSnapshot` rather than OpenAPI's
 * `OrderItem`, since Mongoose embeds the product directly — and not `ProductDocument`, since
 * what's embedded is a subdocument with none of `Document`'s methods on it.
 *
 * `product.title`/`description` are not the catalogue's own words: they are that product's text
 * as RESOLVED into `locale` at order-creation time, then frozen. Reading them later must not
 * re-resolve against whatever locale is ambient at read time — that would let an old order's
 * copy drift into a language the buyer never saw.
 */
export interface OrderDocumentItem {
    /**
     * The product snapshot, embedded.
     *
     * Not a reference and never an `ObjectId`: `orderItemSchema` declares
     * `product: orderLineProductSchema` with no `ref`, so there is nothing for `populate()` to
     * resolve and the un-joined case cannot occur. An order must keep what was bought, not what
     * the catalogue says today — and not what the WAREHOUSE says today either, which is why the
     * embedded schema is its own, narrower than the catalogue's.
     */
    product: ProductSnapshot;
    quantity: number;
    /**
     * The language `product.title`/`description` were resolved into, frozen alongside them —
     * see `resolveSnapshotProducts` in `./services/snapshot`. Lives on the item, not the product:
     * it describes the resolution of the whole line, not a property of the product itself.
     */
    locale: string;
}

/**
 * A consequence of a cancel that the cancel itself could not guarantee.
 *
 * One member, deliberately. The stock half of a cancel heals on its own — the hold keeps its
 * `expiresAt` and the reservation sweep releases it — so it is not written down. The money half
 * does not heal: the domain event bus has no retry, so a refund that throws is lost unless the
 * intent to make it survives the failure.
 */
export type OrderPendingEffect = 'refund';

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
    /**
     * Absent on an order whose account was erased. The invoice survives erasure
     * (Art. 17(3)(b)/(e)); the account it belonged to does not, and unlike every other document
     * here that IS the dangling foreign key, not a bug in it. See `anonymizeAfter`.
     */
    userId?: Types.ObjectId;
    status: OrderStatus;
    notes?: string;
    items: OrderDocumentItem[];
    createdAt?: Date;
    updatedAt?: Date;
    /**
     * Set alongside `userId` being unset, to `now + NODE_ORDER_PII_RETENTION_DAYS`.
     * `ops/reap-orders.ts` scrubs the order's remaining PII (email, shipping name/phone/
     * street) once this elapses; the order row itself is never deleted.
     */
    anonymizeAfter?: Date;
    /**
     * What the cancel decided but has not yet seen through. Written in the same conditional write
     * that moves the status, so the intent and the decision cannot come apart; emptied once the
     * listener has actually returned. Non-empty means `retryPendingEffects` still owes this order
     * something — absent and empty both mean settled.
     */
    pendingEffects?: OrderPendingEffect[];
    deletedAt?: Date;
}

/**
 * Order Document model type.
 * Business logic lives in the service (`./service`); queries live in the repository
 * (`./repository`).
 */
export type OrderModel = Model<OrderDocument>;

/**
 * Schema for the product snapshot embedded on an order line — `openapi.root.yaml`'s
 * `OrderLineProduct`, not `Product`: no `onHand`, no `reserved`, and therefore nothing for a
 * response to derive `available` FROM. Deliberately its own schema rather than `productSchema`
 * reused: the two counters describe the warehouse right now, and an order line must not be ABLE
 * to store them, not merely choose not to.
 *
 * `{ timestamps: true }`, matching `productSchema`: a subdocument stamps its own `createdAt`/
 * `updatedAt` on insert regardless of the parent's timestamps option, which is why
 * `orders/fixtures.ts` carries the catalogue row's own dates in explicitly rather than leaving
 * them to default.
 */
const orderLineProductSchema = new Schema(
    {
        title: { type: String, required: true },
        price: { type: Number, required: true },
        description: { type: String },
        imageUrl: { type: String },
        thumbnailUrl: { type: String },
        categories: { type: [String] },
        tags: { type: [String] },
        active: { type: Boolean },
        requiresShipping: { type: Boolean },
        deletedAt: { type: Date }
    },
    { timestamps: true }
);

/**
 * The embedded snapshot's own wire-shape transform — `_id` → `id`, `__v` dropped, nothing derived:
 * unlike `applyProductTransform`, there is no `available` to compute, because there is no
 * `onHand`/`reserved` on this schema to compute it FROM.
 */
const applyOrderLineProductTransform = applySerialization(orderLineProductSchema);

/**
 * Schema for a single embedded order item.
 * `_id: false` — OpenAPI's OrderItem is `{product, quantity}` only
 * (`additionalProperties: false`), so items don't need their own id.
 */
const orderItemSchema = new Schema(
    {
        product: { type: orderLineProductSchema },
        quantity: {
            type: Number,
            required: true
        },
        // The language `product.title`/`description` were resolved into when this line was
        // frozen — see `OrderDocumentItem.locale`.
        locale: {
            type: String,
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
        // Not `required`, unlike everywhere else this repository stores a foreign key — erasure
        // unsets it deliberately, rather than deleting the invoice.
        userId: {
            type: Schema.Types.ObjectId
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
        },
        anonymizeAfter: {
            type: Date
        },
        /*
         * `default: undefined` overrides Mongoose's implicit `[]` for an array path, so an order
         * that never cancelled carries no key at all — the difference between "owes nothing" and
         * "was never asked". Only the cancel's own write creates it.
         */
        pendingEffects: {
            type: [String],
            enum: ['refund'],
            default: undefined
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
/*
 * `ops/reap-orders.ts`'s own sweep — NOT a TTL index: the row must survive, only its PII
 * gets scrubbed, so nothing here may carry `expireAfterSeconds`.
 */
orderSchema.index({ anonymizeAfter: 1 }, { name: 'orders_anonymizeAfter', sparse: true });
/*
 * `retryPendingEffects`'s query — orders still owing an effect, oldest first. Sparse, so it holds
 * only the handful of orders between a cancel and its consequences rather than every order ever
 * placed. An empty array indexes no key, which is why draining the field is enough to leave it.
 */
orderSchema.index(
    { pendingEffects: 1, updatedAt: 1 },
    { name: 'orders_pendingEffects', sparse: true }
);

/**
 * Recursively normalizes each line's embedded product snapshot — `_id` → `id`, `__v` dropped.
 */
const applyOrderItems = (serialized: Record<string, unknown>) => {
    if (!Array.isArray(serialized.items)) return;

    for (const item of serialized.items as Record<string, unknown>[]) {
        if (item.product && typeof item.product === 'object')
            applyOrderLineProductTransform(item.product as Record<string, unknown>);
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
    // `anonymizeAfter` is the reaper's own bookkeeping and `pendingEffects` the cancel sweep's,
    // neither part of the `Order` contract — same reasoning as `users`' `pendingImageKey`/
    // `inactivityWarnedAt`.
    omit: ['anonymizeAfter', 'pendingEffects'],
    after: (serialized) => {
        applyOrderItems(serialized);
        applyOrderTotals(serialized);
    }
});

/**
 * Mongoose model for order CRUD operations.
 */
export const orderModel = model<OrderDocument, OrderModel>('Order', orderSchema);
