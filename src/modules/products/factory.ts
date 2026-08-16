/**
 * How a product fixture is built — for the demo dataset in `./seeds` and for any test that needs a
 * catalogue row.
 *
 * ## What a factory deliberately does NOT do
 *
 * It does not restate the schema's defaults. `stock`, `active`, `description`, `imageUrl`,
 * `categories` and `tags` all have a `default:` in `./model`, so a caller who says nothing about
 * them gets no key at all and Mongoose fills it in.
 *
 * That omission is the point. `scripts/export-seed.ts` reads the seeded rows back out through the
 * real serializer, so `dataset.json` records what the schema actually does — and the paired
 * frontend's mock stops guessing. It used to guess: `mocks/seeds.ts` over there carried a
 * hand-written `active: true` with a comment admitting it was mirroring a backend default nobody
 * had checked. A factory that helpfully filled those in here would have preserved the guess and
 * moved it one file to the left.
 *
 * Only `title` and `price` get placeholder values, because the schema requires them and a test that
 * writes `makeProduct()` is saying it does not care what they are.
 */

import {
    identityOf,
    compact,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/factory';
import type { Product } from '@types';
import type { ProductDocument, ProductSnapshot } from './model';

/**
 * What a caller may pin. Everything absent is left to the schema.
 *
 * Derived from the generated `Product`, not restated: `openapi.yaml` is what says a product has a
 * `stock` and a `tags`, and a hand-written copy of that list here would be a second declaration no
 * contract change can reach. `deletedAt` widens to accept a `Date` — see `OverridesFor`.
 */
export type ProductOverrides = OverridesFor<Product>;

/**
 * A product ready for `productRepository.create`.
 *
 * The three fields the factory ALWAYS sets are required, not optional. That is what lets a caller
 * read `fixture.title` without a `!` — `orders/seeds.ts` builds its snapshots this way — instead of
 * asserting past a `Partial` that was never as partial as it claimed.
 */
export type ProductFixture = Partial<ProductDocument> &
    Pick<ProductSnapshot, '_id' | 'title' | 'price'>;

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
