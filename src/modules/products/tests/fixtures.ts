/**
 * @module
 * Product fixtures that touch the test database. The BUILDER lives one level up in
 * `../fixtures.ts` — the same file the demo catalogue is built from — this file only persists
 * what it returns. See `../../users/tests/fixtures` for why there is exactly one `makeProduct`.
 */

import type { ProductDocument } from '@modules/products';
import { productRepository } from '@modules/products';
import { makeProduct } from '../fixtures';
import type { ProductOverrides } from '../fixtures';

export { makeProduct, type ProductOverrides } from '../fixtures';

/** Insert a product into the test database and return the Mongoose document. */
export const createProduct = (overrides: ProductOverrides = {}): Promise<ProductDocument> =>
    productRepository.create(makeProduct(overrides));
