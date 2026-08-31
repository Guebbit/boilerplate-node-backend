/**
 * @module
 * Builds a product fixture — for the demo dataset in `./demo` and for any test needing a
 * catalogue row.
 *
 * Deliberately leaves the schema's own defaults (`onHand`, `reserved`, `active`, etc.)
 * unset rather than restating them — only `title` and `price`, which the schema requires,
 * get placeholders. That is what lets `scripts/export-demo-dataset.ts` read seeded rows back
 * through the real serializer, so the exported demo dataset (and the paired frontend's mocks)
 * reflect what the schema actually does instead of a guess.
 */

import {
    identityOf,
    compact,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/fixtures';
import type { Product } from '@types';
import type { ProductDocument, ProductSnapshot } from './model';

/**
 * What a caller may pin. Everything absent is left to the schema.
 *
 * Derived from the generated `Product`, not restated: `openapi.yaml` is what says a product has an
 * `onHand` and a `tags`, and a hand-written copy of that list here would be a second declaration no
 * contract change can reach. `deletedAt` widens to accept a `Date` — see `OverridesFor`.
 *
 * `available` comes along from `Product` and pinning it in a fixture does nothing: it is not a
 * schema path, so Mongoose's strict mode drops it on the way in, and the serializer recomputes it
 * from the counters on the way out. A test that wants a specific availability sets `onHand` and
 * `reserved`, which is the pair that actually decides it.
 */
export type ProductOverrides = OverridesFor<Product>;

/**
 * A product ready for `productRepository.create`.
 *
 * The three fields the factory ALWAYS sets are required, not optional. That is what lets a caller
 * read `fixture.title` without a `!` — `orders/demo.ts` builds its snapshots this way — instead of
 * asserting past a `Partial` that was never as partial as it claimed.
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
    ...compact({ ...fields, deletedAt: toDate(deletedAt) })
});
