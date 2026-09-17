/**
 * @module
 * Product factories that touch the test database. The BUILDER lives one level up in
 * `../factories.ts` — the same file the demo catalogue is built from — this file only persists
 * what it returns. See `../../users/tests/factories` for why there is exactly one `makeProduct`.
 */

import type { ProductDocument } from '../model';
import { productRepository } from '../repository';
import { makeProduct } from '../factories';
import type { ProductOverrides } from '../factories';

export { makeProduct, type ProductOverrides } from '../factories';

/** Insert a product into the test database and return the Mongoose document. */
export const createProduct = (overrides: ProductOverrides = {}): Promise<ProductDocument> =>
    productRepository.create(makeProduct(overrides));

/**
 * The raw stored document, hydrated — a sibling's own assertion on persisted state. Never through
 * `productService`: a generic hydrated read is a step from becoming a generic write, which is
 * exactly what the production barrel stopped publishing.
 */
export const readProduct = (id: string): Promise<ProductDocument | null> =>
    productRepository.findById(id);

/** Persist a document a sibling's fixture already built and mutated in memory. */
export const saveProduct = (document: ProductDocument): Promise<ProductDocument> =>
    productRepository.save(document);

/** Remove a product outright — a sibling's cleanup or negative-path fixture. */
export const deleteProduct = (document: ProductDocument): Promise<void> =>
    productRepository.deleteOne(document);
