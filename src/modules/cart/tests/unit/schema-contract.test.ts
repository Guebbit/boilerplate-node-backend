/**
 * @module
 * The cart schema's contract. The cart and the wishlist are the same shape except one field — a
 * cart line has `quantity`, a wishlist line does not — asserted here as the boundary between the
 * two features. `unique: true` on `userId` does the real work: it makes "one cart per user" a
 * database fact, so every mutation is a single `findOneAndUpdate(upsert: true)` with no read in
 * front of it.
 */

import { cartSchema } from '@modules/cart/model';
import {
    defaultOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    pathNames,
    pathOptions,
    refOf,
    requiredPaths,
    subSchema,
    typeOf
} from '@tests/schema';

describe('cartSchema', () => {
    it('requires an owner and nothing else', () => {
        expect(requiredPaths(cartSchema)).toEqual(['userId']);
    });

    it('makes one cart per user a database fact', () => {
        expect(indexOptionSpecs(cartSchema)).toContain('userId_1: unique=true');
    });

    it('starts a new cart with an empty list, not an absent one', () => {
        expect(defaultOf(cartSchema, 'items')).toEqual([]);
    });

    it('stores the owner as a real ObjectId reference', () => {
        expect(typeOf(cartSchema, 'userId')).toBe('ObjectId');
        expect(refOf(cartSchema, 'userId')).toBe('User');
    });

    it('indexes the product lookup that product deletion depends on', () => {
        // Deleting a product must find every cart holding it; without this it reads the whole
        // collection.
        expect(indexSpecs(cartSchema)).toEqual([
            'items.productId_1: items.productId+1',
            'userId_1: userId+1'
        ]);
    });

    it('keeps timestamps', () => {
        expect(optionsOf(cartSchema).timestamps).toBe(true);
    });
});

describe('cartSchema — a line', () => {
    it('requires a product and a quantity, with no id of its own', () => {
        const item = subSchema(cartSchema, 'items');

        expect(requiredPaths(item)).toEqual(['productId', 'quantity']);
        expect(optionsOf(item)._id).toBe(false);
        expect(refOf(item, 'productId')).toBe('Product');
    });

    it('refuses a quantity below one', () => {
        // A zero-quantity line is a removal that did not remove: it survives every "is it in the
        // cart" check while contributing nothing to any total. Removal is deleting the line.
        const item = subSchema(cartSchema, 'items');

        expect(pathOptions(item, 'quantity').min).toBe(1);
    });

    it('carries a quantity, which is what separates it from a wishlist line', () => {
        expect(pathNames(subSchema(cartSchema, 'items'))).toEqual(['productId', 'quantity']);
    });
});
