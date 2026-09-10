/**
 * @module
 * Product factories that touch the test database. The BUILDER lives one level up in
 * `../factories.ts` — the same file the demo catalogue is built from — this file only persists
 * what it returns. See `../../users/tests/factories` for why there is exactly one `makeProduct`.
 */

import type { ProductDocument } from '@modules/products';
import { productRepository } from '@modules/products';
import { makeProduct } from '../factories';
import type { ProductOverrides } from '../factories';

export { makeProduct, type ProductOverrides } from '../factories';

/** Insert a product into the test database and return the Mongoose document. */
export const createProduct = (overrides: ProductOverrides = {}): Promise<ProductDocument> =>
    productRepository.create(makeProduct(overrides));
