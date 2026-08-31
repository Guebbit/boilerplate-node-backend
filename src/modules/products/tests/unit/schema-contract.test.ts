/**
 * @module
 * The product schema's contract, and the availability it derives from the two stock counters
 * `inventory` writes. Each default decides what a product means when a field was never set —
 * e.g. `onHand: 100` keeps a freshly created product sellable rather than invisible.
 */

import { productSchema, applyProductTransform } from '@modules/products/model';
import { defaultOf, indexSpecs, optionsOf, pathOptions, requiredPaths } from '@tests/schema';

/** A serialized product as the transform receives it, before `available` is added. */
const serialize = (onHand: unknown, reserved: unknown) => {
    const document: Record<string, unknown> = { _id: 'x', onHand, reserved };
    return applyProductTransform(document).available;
};

describe('productSchema — what a product must carry', () => {
    it('requires a title and a price, and nothing else', () => {
        // Everything else has a default or is genuinely optional. A required `description` or
        // `imageUrl` would make the minimal create in the contract impossible.
        expect(requiredPaths(productSchema)).toEqual(['price', 'title']);
    });

    it('refuses negative stock counters', () => {
        // Negative stock is not a state the shop has: it would let `available` be computed from
        // impossible inputs and would make the ledger's replay disagree with the counter.
        for (const path of ['onHand', 'reserved'])
            expect(pathOptions(productSchema, path).min).toBe(0);
    });

    it('publishes a new product with stock and nothing reserved', () => {
        expect(defaultOf(productSchema, 'onHand')).toBe(100);
        expect(defaultOf(productSchema, 'reserved')).toBe(0);
        expect(defaultOf(productSchema, 'active')).toBe(true);
    });

    it('defaults the text and list fields to empty rather than absent', () => {
        // `categories` and `tags` feed the facet endpoint, which counts array members: `undefined`
        // there is a different code path in every consumer, and one of them will forget it.
        expect(defaultOf(productSchema, 'description')).toBe('');
        expect(defaultOf(productSchema, 'categories')).toEqual([]);
        expect(defaultOf(productSchema, 'tags')).toEqual([]);
    });

    it('gives every product an image without requiring one', () => {
        // A catalogue with a broken image is worse than one with a placeholder, and the
        // environment override is what lets a deployment supply its own.
        expect(defaultOf(productSchema, 'imageUrl')).toBe(
            process.env.NODE_DEFAULT_IMAGE_PRODUCT ?? 'https://placekitten.com/400/400'
        );
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
    it('declares exactly the two documented indexes, named', () => {
        // `products_createdAt` is newest-first for the listing; `products_active_deletedAt` is the
        // public visibility scope — the pair of conditions every anonymous read applies.
        expect(indexSpecs(productSchema)).toEqual([
            'products_active_deletedAt: active+1, deletedAt+1',
            'products_createdAt: createdAt-1'
        ]);
    });
});

describe('applyProductTransform — the derived availability', () => {
    it('reports what is left after holds', () => {
        expect(serialize(10, 3)).toBe(7);
    });

    it('never reports a negative availability', () => {
        // Over-reservation is possible under a race the counters recover from; a negative number
        // on the wire would be rendered by a storefront as a negative stock badge.
        expect(serialize(3, 10)).toBe(0);
    });

    it('treats a missing counter as zero rather than propagating NaN', () => {
        // The defence the schema defaults make unnecessary in normal operation, and which still
        // has to hold for documents written before those defaults existed. `undefined - 0` is
        // `NaN`, which serializes as `null` and reads as "out of stock" everywhere.
        expect(serialize(undefined, 2)).toBe(0);
        expect(serialize(5, undefined)).toBe(5);
        expect(serialize(undefined, undefined)).toBe(0);
    });

    it('ignores counters of the wrong type instead of coercing them', () => {
        // A string `onHand` would make `-` coerce and sometimes succeed, producing a plausible
        // wrong number. Treating a non-number as zero fails visibly instead.
        expect(serialize('12', 2)).toBe(0);
    });
});
