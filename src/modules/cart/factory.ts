/**
 * How a cart fixture is built.
 *
 * ## Why a cart fixture pins an `_id` even though a cart is addressed by its owner
 *
 * `carts.userId` is `unique`, every query here reaches a cart through it, and no cart id ever
 * reaches the wire — so for a long time these fixtures pinned nothing and let mongod assign one.
 * `scripts/export-seed.ts` is what changed the calculus: a generated id is a different 24 characters
 * on every run, which lands in `demo-data.json`, which is committed and hash-compared against the
 * paired frontend. One unpinnable value is enough to make the whole artefact permanently stale.
 *
 * Pinning it grants nothing it did not already have. There is still no endpoint that takes a cart
 * id, and `./demo` still upserts by owner rather than by this. It is a fixture being deterministic,
 * not a handle being published.
 *
 * Ids arrive as strings and leave as `ObjectId`s. A cart line stores a real reference (`ref:
 * 'Product'`), and a string silently matches nothing in Mongo rather than failing loudly.
 */

import { Types } from 'mongoose';
import { identityOf, type FactoryIdentity } from '@infrastructure/persistence/factory';
import type { CartItem, Id } from '@types';
import type { CartDocument } from './model';

/**
 * A line is the contract's `CartItem` — `{ productId, quantity }` — imported rather than restated.
 * `openapi.yaml` owns that shape, and the mock handlers in the paired frontend build the same one.
 */
export interface CartOverrides extends FactoryIdentity {
    /** 24-char hex of the owning user. */
    userId: Id;
    /** Absent leaves the schema's `default: []` to apply. */
    items?: CartItem[];
}

/**
 * A cart ready for `cartRepository.create`.
 *
 * `userId` is required, because the factory cannot build one without it — a cart is addressed by
 * its owner. Leaving it optional under `Partial` forced `./demo` to assert `fixture.userId!` past
 * a type that was never actually unsure.
 */
export type CartFixture = Partial<CartDocument> & Pick<CartDocument, 'userId'>;

export const makeCart = ({ userId, items, ...identity }: CartOverrides): CartFixture => ({
    userId: new Types.ObjectId(userId),
    ...identityOf(identity),
    ...(items === undefined
        ? {}
        : {
              items: items.map(({ productId, quantity }) => ({
                  productId: new Types.ObjectId(productId),
                  quantity
              }))
          })
});
