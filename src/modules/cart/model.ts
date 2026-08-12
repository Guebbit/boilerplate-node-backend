import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * Cart Model
 *
 * A cart is its own collection keyed by `userId`, not a subdocument of the user. Two things follow
 * from that, and both are the point:
 *
 *   - a user response cannot leak a cart it does not carry, so the serializer has nothing to omit;
 *   - touching a cart reads and writes one small document instead of the whole user.
 *
 * Field names match `openapi.yaml`'s `CartItem` (`{ productId, quantity }`) so a stored line and a
 * wire line are the same shape — there is no mapper between them to keep in sync.
 *
 * Mongo and not Redis because Redis here is CACHE-ONLY: no persistence, `allkeys-lru` eviction, and
 * an adapter that fails open (`@infrastructure/adapters/cache`). If Redis were made a primary store, a cart
 * could live at `cart:{token}` with the key's TTL as abandoned-cart expiry and `HINCRBY` making
 * concurrent writes race-free for nothing — paid for in durability, and in
 * `productRemoveFromCartsById`, which is one indexed query here and a hand-maintained secondary
 * index there.
 */

/**
 * A stored cart line.
 *
 * `productId` is an `ObjectId` and stays one. `populate('items.productId')` overwrites the field in
 * place at runtime, so the id has to be read BEFORE populating — `./service` `readCartLines`
 * is the one place that does it, and it returns the id and the joined product as separate fields.
 */
export interface ICartItem {
    productId: Types.ObjectId;
    quantity: number;
}

/**
 * Cart Document interface.
 *
 * No contract type to extend: `CartResponse` is `{ items, summary }` — a computed view, not this
 * document. A cart id never reaches the wire.
 */
export interface ICartDocument extends Document {
    userId: Types.ObjectId;
    items: ICartItem[];
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
export type ICartModel = Model<ICartDocument>;

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
export const cartSchema = new Schema<ICartDocument>(
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
 * Every other query here reaches a cart through `userId`, which `unique: true` above already
 * indexes. This is the exception: deleting a product has to find every cart holding it, and
 * without an index that reads the whole collection.
 *
 * Left unnamed because nothing else creates it, so Mongoose's derived name is the only name it
 * will ever have and there is nothing for it to disagree with.
 */
cartSchema.index({ 'items.productId': 1 });

/**
 * Normalizes a serialized cart: the shared `_id` → `id` and `__v` removal, nothing else.
 *
 * No endpoint serves this shape — `./service` builds `CartResponse` by hand from the lines
 * and their prices. It exists because every repository owes the base factory a transform for its
 * lean reads (see `normalize` in @infrastructure/persistence/base-repository).
 */
export const applyCartTransform = applySerialization(cartSchema);

/**
 * Model
 */
export const cartModel = model<ICartDocument, ICartModel>('Cart', cartSchema);
