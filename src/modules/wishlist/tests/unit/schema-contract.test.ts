/**
 * @module
 * The wishlist schema's contract. Two invisible-from-a-document declarations carry the whole
 * design: `unique: true` on `userId` makes "one wishlist per user" a database fact, so every
 * mutation is a single unguarded `findOneAndUpdate(..., { upsert: true })`; `_id: false` on a
 * line, since `WishlistItem` in `openapi.yaml` is `additionalProperties: false`.
 */

import { wishlistSchema } from '@modules/wishlist/model';
import {
    defaultOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    pathNames,
    refOf,
    requiredPaths,
    subSchema,
    typeOf
} from '@tests/schema';

describe('wishlistSchema', () => {
    it('requires an owner and nothing else', () => {
        // `items` is not required: an empty wishlist is a wishlist, and the upsert that creates
        // one has no items to give it.
        expect(requiredPaths(wishlistSchema)).toEqual(['userId']);
    });

    it('makes one wishlist per user a database fact', () => {
        expect(indexOptionSpecs(wishlistSchema)).toContain('userId_1: unique=true');
    });

    it('starts a new wishlist with an empty list, not an absent one', () => {
        // `$addToSet` on a missing path works, but every reader would have to tolerate
        // `undefined`. The default is what keeps `items.length` honest everywhere.
        expect(defaultOf(wishlistSchema, 'items')).toEqual([]);
    });

    it('stores the owner and the product as references, as ObjectIds', () => {
        expect(typeOf(wishlistSchema, 'userId')).toBe('ObjectId');
        expect(refOf(wishlistSchema, 'userId')).toBe('User');
        expect(refOf(subSchema(wishlistSchema, 'items'), 'productId')).toBe('Product');
    });

    it('gives a line no id of its own, and no quantity', () => {
        const item = subSchema(wishlistSchema, 'items');

        expect(optionsOf(item)._id).toBe(false);
        // A wishlist answers "do I want this", not "how many" — the moment an amount matters the
        // line belongs in the cart. One field fewer is also what makes `$addToSet` the whole
        // idempotence story.
        expect(requiredPaths(item)).toEqual(['productId']);
        expect(pathNames(item)).toEqual(['productId']);
    });

    it('indexes the product lookup that product deletion depends on', () => {
        // Deleting a product must find every wishlist holding it; without this it reads the whole
        // collection. Left unnamed deliberately — nothing else creates it, so Mongoose's derived
        // name has nothing to disagree with.
        expect(indexSpecs(wishlistSchema)).toEqual([
            'items.productId_1: items.productId+1',
            'userId_1: userId+1'
        ]);
    });

    it('keeps timestamps', () => {
        expect(optionsOf(wishlistSchema).timestamps).toBe(true);
    });
});
