/**
 * Schema contract — the declarations themselves, not the transforms.
 *
 * The sibling specs in this folder cover behaviour; this covers what the SCHEMA says, which is
 * equally part of the API and is not exercised anywhere else:
 *
 *   **Defaults** decide what a client gets for a field it never sent. A row created without a
 *   flag is visible or invisible depending on one word in the schema, and nothing else pins which.
 *
 *   **`required`** is the only thing standing between a malformed write and a persisted row that
 *   later breaks every reader. Asserted per field, since each is an independent one-line flag.
 *
 *   **`select: false`** on credentials is why they do not leak from an ordinary read.
 *
 * Real Mongo, because these are Mongoose's behaviours rather than ours: a mocked model would
 * assert the mock's opinion of what `default` means.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { cartRepository } from '@modules/cart/repository';
import { cartModel } from '@modules/cart/model';
import { createProduct } from '@modules/products/tests/fixtures';
import { createUser } from '@modules/users/tests/fixtures';

setupTestDb();

describe('cart schema', () => {
    it('starts with an empty items array', async () => {
        const user = await createUser({ email: 'carty@example.com' });

        const cart = await cartRepository.create({ userId: user._id } as never);

        expect(cart.items).toEqual([]);
    });

    it('requires a userId', async () => {
        await expect(cartRepository.create({ items: [] } as never)).rejects.toThrow();
    });

    it('refuses a second cart for the same user', async () => {
        // The unique index, not a convention every write path has to remember.
        const user = await createUser({ email: 'twice@example.com' });
        await cartRepository.create({ userId: user._id } as never);
        await cartModel.syncIndexes();

        await expect(cartRepository.create({ userId: user._id } as never)).rejects.toThrow();
    });

    it('refuses a line with no product', async () => {
        // A line that references nothing prices as zero and renders as a blank row.
        const user = await createUser({ email: 'noproduct@example.com' });

        await expect(
            cartRepository.create({ userId: user._id, items: [{ quantity: 1 }] } as never)
        ).rejects.toThrow();
    });

    it('refuses a line with no quantity', async () => {
        const user = await createUser({ email: 'noquantity@example.com' });
        const product = await createProduct();

        await expect(
            cartRepository.create({
                userId: user._id,
                items: [{ productId: product._id }]
            } as never)
        ).rejects.toThrow();
    });

    it('refuses a line with a quantity below one', async () => {
        // A zero-quantity line is a removal expressed as a write, and `CartItem` declares
        // `minimum: 1`.
        const user = await createUser({ email: 'zero@example.com' });
        const product = await createProduct();

        await expect(
            cartRepository.create({
                userId: user._id,
                items: [{ productId: product._id, quantity: 0 }]
            } as never)
        ).rejects.toThrow();
    });

    it('gives a line no id of its own', async () => {
        const user = await createUser({ email: 'lines@example.com' });
        const product = await createProduct();

        const cart = await cartRepository.create({
            userId: user._id,
            items: [{ productId: product._id, quantity: 2 }]
        } as never);

        expect(cart.toObject().items).toEqual([{ productId: product._id, quantity: 2 }]);
    });

    it('stamps createdAt and updatedAt', async () => {
        const user = await createUser({ email: 'stamped@example.com' });

        const cart = await cartRepository.create({ userId: user._id } as never);

        expect(cart.createdAt).toBeInstanceOf(Date);
        expect(cart.updatedAt).toBeInstanceOf(Date);
    });
});
