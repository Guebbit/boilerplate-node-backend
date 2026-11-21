/**
 * @module
 * The product schema's contract, and what its serialization leaves off the wire. Each default
 * decides what a product means when a field was never set — e.g. `active: true` publishes a new
 * product unless it is told otherwise.
 */

import { productSchema, applyProductTransform } from '@modules/products/model';
import { defaultOf, indexOptionSpecs, indexSpecs, optionsOf, requiredPaths } from '@tests/schema';

/** One bare document as the transform receives it. */
const serialized = () => applyProductTransform({ _id: 'x' });

describe('productSchema — what a product must carry', () => {
    it('requires a title and a price, and nothing else', () => {
        /**
         * Everything else has a default or is genuinely optional. A required `description` or
         * `imageUrl` would make the minimal create in the contract impossible.
         */
        expect(requiredPaths(productSchema)).toEqual(['price', 'title']);
    });

    it('publishes a new product unless told otherwise', () => {
        expect(defaultOf(productSchema, 'active')).toBe(true);
    });

    it('assumes a product is physical unless told otherwise', () => {
        /**
         * Matches `openapi.yaml`'s default: an undeclared default here is one `cart` would have
         * to guess at when deciding whether a checkout needs a shipping method.
         */
        expect(defaultOf(productSchema, 'requiresShipping')).toBe(true);
    });

    it('defaults the list fields to empty rather than absent, and the description to none', () => {
        /**
         * `categories` and `tags` feed the facet endpoint, which counts array members: `undefined`
         * there is a different code path in every consumer, and one of them will forget it.
         * A description is the other way round: none is no field, never `''` on the wire.
         */
        expect(defaultOf(productSchema, 'description')).toBeUndefined();
        expect(defaultOf(productSchema, 'categories')).toEqual([]);
        expect(defaultOf(productSchema, 'tags')).toEqual([]);
    });

    it('gives a new product no image', () => {
        // A default would put a placeholder in the database; the client draws its own.
        expect(defaultOf(productSchema, 'imageUrl')).toBeUndefined();
    });

    it('leaves the soft-delete marker unset', () => {
        // Soft deletion is the absence of `deletedAt`; a default would delete every product.
        expect(defaultOf(productSchema, 'deletedAt')).toBeUndefined();
    });

    it('keeps timestamps, which the catalogue is ordered by', () => {
        expect(optionsOf(productSchema).timestamps).toBe(true);
    });
});

describe('productSchema — indexes', () => {
    it('declares exactly the three documented indexes, named', () => {
        /**
         * `products_createdAt` is newest-first for the listing; `products_active_deletedAt` is the
         * public visibility scope — the pair of conditions every anonymous read applies;
         * `products_sku` is the uniqueness guarantee on an optional field.
         */
        expect(indexSpecs(productSchema)).toEqual([
            'products_active_deletedAt: active+1, deletedAt+1',
            'products_createdAt: createdAt-1',
            'products_sku: sku+1'
        ]);
    });

    it('lets a sku repeat only by being absent — unique when set', () => {
        /**
         * Sparse: most products never carry a `sku` at all, and an unfiltered unique index would
         * index every absent value as an equal `null`, colliding on the second such product —
         * same reasoning as `orders`' `orders_transferReference`.
         */
        expect(indexOptionSpecs(productSchema)).toContain('products_sku: sparse=true, unique=true');
    });
});

describe('applyProductTransform — the serialized product', () => {
    it('stamps the live currency and every action closed', () => {
        expect(serialized()).toMatchObject({
            currency: expect.any(String),
            actions: { update: false, delete: false, restore: false, hardDelete: false }
        });
    });
});
