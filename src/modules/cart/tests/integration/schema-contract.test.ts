/**
 * @module
 * Schema contract — the declarations themselves (defaults, `required`, `select: false`), not the
 * transforms the sibling specs cover. Equally part of the API and untested elsewhere: a default
 * decides what a client gets when it sends nothing, `required` stops a malformed write reaching
 * readers, and `select: false` is why credentials don't leak from an ordinary read. Real Mongo —
 * these are Mongoose's behaviours, not ours; a mock would assert its own opinion.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { cartRepository } from '@modules/cart/repository';
import { cartModel } from '@modules/cart/model';
import { createUser } from '@modules/users/tests/fixtures';

setupTestDb();

describe('cart schema', () => {
    it('refuses a second cart for the same user', async () => {
        // The unique index, not a convention every write path has to remember.
        const user = await createUser({ email: 'twice@example.com' });
        await cartRepository.create({ userId: user._id } as never);
        await cartModel.syncIndexes();

        await expect(cartRepository.create({ userId: user._id } as never)).rejects.toThrow();
    });
});
