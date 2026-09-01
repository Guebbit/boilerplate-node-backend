/**
 * @module
 * Cart model — one document per user, not a subdocument, so a user response can't leak a cart it
 * doesn't carry. Field names match `openapi.yaml`'s `CartItem` for identical stored/wire shapes.
 * Mongo, not Redis: Redis here is cache-only, fails open — the wrong properties for the only
 * durable copy of what's in someone's cart.
 *
 * See: docs/modules/cart.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * A stored cart line.
 *
 * `productId` is an `ObjectId` and stays one. `populate('items.productId')` overwrites the field in
 * place at runtime, so the id has to be read BEFORE populating — `./service` `readCartLines`
 * is the one place that does it, and it returns the id and the joined product as separate fields.
 */
export interface CartItem {
    productId: Types.ObjectId;
    quantity: number;
}

/**
 * Cart Document interface.
 *
 * No contract type to extend: `CartResponse` is `{ items, summary }` — a computed view, not this
 * document. A cart id never reaches the wire.
 */
export interface CartDocument extends Document {
    userId: Types.ObjectId;
    items: CartItem[];
    createdAt?: Date;
    updatedAt?: Date;
    /**
     * Mongoose's version key, declared here because this is the one document whose version is
     * READ by application code rather than only maintained by the driver.
     *
     * Checkout empties the cart conditionally on the version it read the lines at — see
     * `clearLinesIfUnchanged` in `./repository` — which is what stops two parallel
     * checkouts turning one cart into two orders. `Document` types it as `any`, so naming it
     * gives the comparison an actual type and gives the field somewhere to be explained.
     */
    /* `__v` is Mongoose's own version key: the name belongs to the driver, not to this codebase. */
    __v: number;
}

/** Cart Document model type. Queries live in `./repository`, rules in `./service`. */
export type CartModel = Model<CartDocument>;

/**
 * Schema for a single cart line.
 *
 * `_id: false` — a cart line is addressed by its product, never by itself, and `CartItem` is
 * `additionalProperties: false`, so a generated subdocument id would be a contract violation
 * waiting to be serialized.
 */
const cartItemSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        }
    },
    { _id: false }
);

/**
 * Mongoose schema for persisted cart documents.
 *
 * `unique: true` on `userId` is what makes "one cart per user" a database fact rather than
 * something every write path has to remember, and it is what lets every mutation be a single
 * `findOneAndUpdate({ userId }, …, { upsert: true })`.
 */
export const cartSchema = new Schema<CartDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        items: {
            type: [cartItemSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

/*
 * The one query that reaches a cart by something other than `userId`: deleting a product has
 * to find every cart holding it, and without an index that reads the whole collection. Left
 * unnamed since nothing else creates it.
 */
cartSchema.index({ 'items.productId': 1 });

/**
 * How long an untouched cart survives, in days, before Mongo's TTL index removes it — read at
 * import time since a TTL index is created once, at startup, from whatever value is configured
 * then (same caveat as `audit-logs/model.ts`'s).
 */
const cartRetentionDays = environmentNumber('NODE_CART_RETENTION_DAYS', 365, 1);

/*
 * TTL index, GDPR_FIX.md G5: an abandoned cart is convenience state with no legal basis for
 * indefinite storage, unlike an order. `updatedAt`, not `createdAt` — any change to the cart
 * (a quantity bump, an added line) restarts the clock, which is what "abandoned" means.
 *
 * Same caveat as every other TTL index here: Mongo will not modify an existing index's
 * `expireAfterSeconds` when `NODE_CART_RETENTION_DAYS` changes — a migration (`collMod`) is
 * needed, not a restart.
 */
cartSchema.index(
    { updatedAt: 1 },
    { name: 'carts_updatedAt_ttl', expireAfterSeconds: cartRetentionDays * 24 * 60 * 60 }
);

/**
 * Normalizes a serialized cart: the shared `_id` → `id` and `__v` removal, nothing else.
 *
 * No endpoint serves this shape — `./service` builds `CartResponse` by hand from the lines
 * and their prices. It exists because every repository owes the repository factory a transform for its
 * lean reads (see `normalize` in @infrastructure/persistence/create-repository).
 */
export const applyCartTransform = applySerialization(cartSchema);

/** Cart model entrypoint. */
export const cartModel = model<CartDocument, CartModel>('Cart', cartSchema);
