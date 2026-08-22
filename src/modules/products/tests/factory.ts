/**
 * Product fixtures that touch the test database.
 *
 * The BUILDER lives one level up, in `src/modules/products/factory.ts` — the same file the demo
 * catalogue is built from — and this file only persists what it returns. See
 * `../../users/tests/factory` for why there is exactly one `makeProduct`.
 *
 *   makeProduct(overrides?)   – a plain payload, no database write.
 *   createProduct(overrides?) – inserts and returns the Mongoose document.
 *
 *   const product = await createProduct({ title: 'Gadget', price: 49.99 });
 *
 * Only `title` and `price` have factory defaults, because only those two are required by the
 * schema. `description`, `imageUrl`, `stock`, `categories`, `tags` and `active` are left unset so a
 * fixture exercises the model's real defaults rather than a restatement of them — which is what
 * lets the exported dataset record what the schema actually does.
 */

import type { ProductDocument } from '@modules/products';
import { productRepository } from '@modules/products';
import { makeProduct } from '../factory';
import type { ProductOverrides } from '../factory';

export { makeProduct, type ProductOverrides } from '../factory';

/** Insert a product into the test database and return the Mongoose document. */
export const createProduct = (overrides: ProductOverrides = {}): Promise<ProductDocument> =>
    productRepository.create(makeProduct(overrides));
