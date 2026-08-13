import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * Wishlist Model
 *
 * A wishlist is its own collection keyed by `userId`, exactly like the cart and for the same two
 * reasons: a user response cannot leak a list it does not carry, and touching a wishlist reads
 * and writes one small document instead of the whole user.
 *
 * A line is `{ productId }` and nothing else — no quantity, deliberately. A wishlist answers
 * "do I want this", not "how many": the moment an amount matters the line belongs in the cart,
 * which is what `POST /wishlist/{productId}/move-to-cart` is for. One field fewer is also what
 * makes `$addToSet` the whole idempotence story below.
 */

/**
 * A stored wishlist line.
 *
 * `productId` is an `ObjectId` and stays one — the service reads ids before any populate, the
 * same discipline `cart`'s `readCartLines` documents.
 */
export interface IWishlistItem {
    productId: Types.ObjectId;
}

/**
 * Wishlist Document interface.
 *
 * No contract type to extend: `WishlistResponse` is `{ items }` — a view, not this document.
 * A wishlist id never reaches the wire.
 */
export interface IWishlistDocument extends Document {
    userId: Types.ObjectId;
    items: IWishlistItem[];
    createdAt?: Date;
    updatedAt?: Date;
}

/** Wishlist Document model type. Queries live in `./repository`, rules in `./service`. */
export type IWishlistModel = Model<IWishlistDocument>;

/**
 * Schema for a single wishlist line.
 *
 * `_id: false` — a line is addressed by its product, never by itself, and `WishlistItem` in
 * `openapi.yaml` is `additionalProperties: false`, so a generated subdocument id would be a
 * contract violation waiting to be serialized.
 */
const wishlistItemSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        }
    },
    { _id: false }
);

/**
 * Mongoose schema for persisted wishlist documents.
 *
 * `unique: true` on `userId` makes "one wishlist per user" a database fact, exactly as the
 * cart's does — every mutation stays a single `findOneAndUpdate({ userId }, …, { upsert: true })`
 * with no read in front of it.
 */
export const wishlistSchema = new Schema<IWishlistDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        items: {
            type: [wishlistItemSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

/*
 * Deleting a product has to find every wishlist holding it; without this it reads the whole
 * collection. Left unnamed for the same reason the cart's twin is: nothing else creates it, so
 * Mongoose's derived name has nothing to disagree with.
 */
wishlistSchema.index({ 'items.productId': 1 });

/**
 * Normalizes a serialized wishlist: `_id` → `id`, drops `__v`. Owed to the base factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/base-repository).
 */
export const applyWishlistTransform = applySerialization(wishlistSchema);

/**
 * Model
 */
export const wishlistModel = model<IWishlistDocument, IWishlistModel>('Wishlist', wishlistSchema);
