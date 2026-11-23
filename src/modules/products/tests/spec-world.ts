/**
 * @module
 * What `products` adds to the sweeps' world: a stocked product for `{productId}`, for the catalogue,
 * wishlist and cart paths.
 *
 * @see docs/build/module-removal.md#what-demo-remove-does-about-the-residue
 */
import type { SpecWorldContribution } from '@tests/spec-world';
import { createProduct } from './factories';

/** A stored product with stock enough that no sweep exhausts it. */
export const specWorld: SpecWorldContribution = {
    key: 'productId',
    seed: () => createProduct({ onHand: 50 }).then((product) => String(product._id)),
    parameters: ['productId'],
    pathPrefixes: [/^\/(?:products|wishlist|cart)\//]
};
