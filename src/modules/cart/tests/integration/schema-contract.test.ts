/**
 * @module
 * Schema contract — the declarations themselves (defaults, `required`, `select: false`), not the
 * transforms the sibling specs in this folder cover.
 *
 * These are equally part of the API and untested elsewhere: a field's default decides what a
 * client gets when it sends nothing, `required` is what stops a malformed write reaching readers,
 * and `select: false` is why credentials don't leak from an ordinary read.
 *
 * Real Mongo — these are Mongoose's behaviours, not ours; a mock would assert its own opinion.
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
