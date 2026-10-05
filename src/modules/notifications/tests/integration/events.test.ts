/**
 * @module
 * What each domain event becomes in the inbox, driven the way production drives it: the real
 * modules registered, a real product deletion (or merge) at one end and the rows at the other.
 * Nothing here calls a subscriber directly — the wiring in `module.ts` is part of what is tested.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { cartService } from '@modules/cart';
import { wishlistService } from '@modules/wishlist';
import { notificationsService } from '@modules/notifications/services';
import { userService } from '@modules/users';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { enabledModules } from '../../../../modules';

setupTestDb();

/** A user's inbox, newest first. */
const inboxOf = (userId: string) =>
    notificationsService.notificationsList(userId).then(({ items }) => items);

describe('the module subscriptions', () => {
    beforeEach(() => {
        resetDomainEvents();
        registerModules(enabledModules);
    });

    describe('a deleted product', () => {
        it('tells each cart owner once, naming the product, and nobody else', async () => {
            const holder = await createUser({ email: 'holder@example.com', username: 'holder' });
            const bystander = await createUser({ email: 'by@example.com', username: 'by' });
            const doomed = await createProduct({ title: 'Blue mug' });
            await cartService.cartItemAddById(holder.id, String(doomed._id), 2);

            await productService.removeById(String(doomed._id), true);

            const [message, ...rest] = await inboxOf(holder.id);
            expect(rest).toEqual([]);
            expect(message).toMatchObject({
                code: 'notifications.cart-line-removed',
                severity: 'warning',
                params: { productId: String(doomed._id), titles: { en: 'Blue mug' } }
            });
            await expect(inboxOf(bystander.id)).resolves.toEqual([]);
        });

        it('tells each wishlist owner, with the wishlist’s own code', async () => {
            const saver = await createUser();
            const doomed = await createProduct({ title: 'Blue mug' });
            await wishlistService.wishlistAdd(saver.id, String(doomed._id), testCallerContext);

            await productService.removeById(String(doomed._id), true);

            const [message] = await inboxOf(saver.id);
            expect(message).toMatchObject({
                code: 'notifications.wishlist-item-removed',
                params: { productId: String(doomed._id), titles: { en: 'Blue mug' } }
            });
        });

        it('writes both messages for a user who held the product in both lists', async () => {
            const user = await createUser();
            const doomed = await createProduct({ title: 'Blue mug' });
            await cartService.cartItemAddById(user.id, String(doomed._id), 1);
            await wishlistService.wishlistAdd(user.id, String(doomed._id), testCallerContext);

            await productService.removeById(String(doomed._id), true);

            const inbox = await inboxOf(user.id);
            const codes = inbox.map(({ code }) => code).toSorted();
            expect(codes).toEqual([
                'notifications.cart-line-removed',
                'notifications.wishlist-item-removed'
            ]);
        });

        it('tells owners of a SOFT delete too, while the product still exists', async () => {
            const holder = await createUser();
            const hidden = await createProduct({ title: 'Blue mug' });
            await cartService.cartItemAddById(holder.id, String(hidden._id), 1);

            await productService.removeById(String(hidden._id), false);

            await expect(inboxOf(holder.id)).resolves.toHaveLength(1);
        });

        it('writes nothing when no list held the product', async () => {
            const user = await createUser();
            const unheld = await createProduct();

            await productService.removeById(String(unheld._id), true);

            await expect(inboxOf(user.id)).resolves.toEqual([]);
        });
    });

    describe('a guest-cart merge', () => {
        it('writes ONE message listing every line that could not be added at all, with the product names', async () => {
            const user = await createUser();
            const fine = await createProduct({ title: 'Fine product' });
            const gone = await createProduct({ title: 'Soon gone' });
            const hidden = await createProduct({ title: 'Hidden' });
            await productService.removeById(String(gone._id), false);
            await productService.removeById(String(hidden._id), false);

            await cartService.cartMerge(
                user.id,
                [
                    { productId: String(fine._id), quantity: 1 },
                    { productId: String(gone._id), quantity: 3 },
                    { productId: String(hidden._id), quantity: 2 }
                ],
                testCallerContext
            );

            const [message, ...rest] = await inboxOf(user.id);
            expect(rest).toEqual([]);
            expect(message).toMatchObject({
                code: 'notifications.cart-merge-refused',
                params: {
                    lines: [
                        {
                            productId: String(gone._id),
                            requested: 3,
                            titles: { en: 'Soon gone' }
                        },
                        {
                            productId: String(hidden._id),
                            requested: 2,
                            titles: { en: 'Hidden' }
                        }
                    ]
                }
            });
            // The contract's `CartMergeRefusedParams` names nothing else: no reason, no quantity.
            expect(Object.keys(message?.params ?? {})).toEqual(['lines']);
        });

        it('writes nothing for a sold-out product: it was added, and a stock-out is temporary', async () => {
            const user = await createUser();
            const soldOut = await createProduct({ onHand: 0 });

            await cartService.cartMerge(
                user.id,
                [{ productId: String(soldOut._id), quantity: 2 }],
                testCallerContext
            );

            await expect(inboxOf(user.id)).resolves.toEqual([]);
        });

        it('writes nothing for lines that landed with another quantity', async () => {
            const user = await createUser();
            const full = await createProduct({ onHand: 5000 });
            const scarce = await createProduct({ onHand: 1 });
            await cartService.cartItemAddById(user.id, String(full._id), 999);

            await cartService.cartMerge(
                user.id,
                [
                    { productId: String(full._id), quantity: 1 },
                    { productId: String(scarce._id), quantity: 4 }
                ],
                testCallerContext
            );

            await expect(inboxOf(user.id)).resolves.toEqual([]);
        });

        it('writes nothing when every line was added', async () => {
            const user = await createUser();
            const fine = await createProduct();

            await cartService.cartMerge(
                user.id,
                [{ productId: String(fine._id), quantity: 1 }],
                testCallerContext
            );

            await expect(inboxOf(user.id)).resolves.toEqual([]);
        });
    });

    it('a hard-deleted user takes their inbox with them', async () => {
        const user = await createUser();
        const product = await createProduct();
        await cartService.cartItemAddById(user.id, String(product._id), 1);
        await productService.removeById(String(product._id), true);
        await expect(inboxOf(user.id)).resolves.toHaveLength(1);

        await userService.removeById(user.id, true);

        await expect(inboxOf(user.id)).resolves.toEqual([]);
    });
});
