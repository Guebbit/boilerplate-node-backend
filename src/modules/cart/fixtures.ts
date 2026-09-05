/**
 * @module
 * How a cart fixture is built. Pins an `_id` even though a cart is addressed by its owner
 * (`userId` is unique) — `scripts/demo/export-dataset.ts` commits a hash-compared
 * `demo-data.json`, and a generated id would stale that artefact on every run. Ids arrive as
 * strings and leave as `ObjectId`s; a bare string would silently match nothing in Mongo.
 */

import { Types } from 'mongoose';
import { identityOf, type FactoryIdentity } from '@infrastructure/persistence/fixtures';
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
 * `userId` is required, because the builder cannot build one without it — a cart is addressed by
 * its owner. Leaving it optional under `Partial` forced `./demo` to assert `fixture.userId!` past
 * a type that was never actually unsure.
 */
export type CartFixture = Partial<CartDocument> & Pick<CartDocument, 'userId'>;

/**
 * Build a cart fixture from bare product ids and quantities, converting each id to the `ObjectId`
 * the schema stores.
 *
 * @param overrides - the owner, optional lines, and the identity fields `identityOf` reads
 * @returns a fixture ready for `cartRepository.create`
 */
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
