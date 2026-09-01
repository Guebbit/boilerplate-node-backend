/**
 * @module
 * Builds a product fixture — for the demo dataset in `./demo` and for any test needing a
 * catalogue row. Deliberately leaves the schema's own defaults unset, placeholdering only the
 * required `title` and `price`, so `scripts/export-demo-dataset.ts` reads seeded rows back
 * through the real serializer instead of a guess.
 */

import {
    identityOf,
    stripUndefined,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/fixtures';
import type { Product } from '@types';
import type { ProductDocument, ProductSnapshot } from './model';

/**
 * What a caller may pin; everything absent is left to the schema. Derived from the generated
 * `Product` rather than restated, so a contract change can't drift out of sync. `available` is
 * accepted but ignored — it isn't a schema path — so pin `onHand`/`reserved` instead to fix it.
 */
export type ProductOverrides = OverridesFor<Product>;

/**
 * A product ready for `productRepository.create`. The three factory-set fields are required, not
 * optional, so callers like `orders/demo.ts` can read `fixture.title` without a `!`.
 */
export type ProductFixture = Partial<ProductDocument> &
    Pick<ProductSnapshot, '_id' | 'title' | 'price'>;

/**
 * Builds one product fixture, filling `title` and `price` with placeholders and leaving every
 * other field to the schema's own `default:` unless the caller overrides it.
 *
 * @param overrides - fields to pin; anything omitted is left for Mongoose to default
 * @returns a fixture ready for `productRepository.create`
 */
export const makeProduct = ({
    id,
    createdAt,
    updatedAt,
    deletedAt,
    ...fields
}: ProductOverrides = {}): ProductFixture => ({
    ...identityOf({ id, createdAt, updatedAt }),
    title: 'Test Product',
    price: 9.99,
    ...stripUndefined({ ...fields, deletedAt: toDate(deletedAt) })
});
