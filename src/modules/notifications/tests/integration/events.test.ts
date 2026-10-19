/**
 * @module
 * What each domain event becomes in the inbox, driven the way production drives it: the real
 * modules registered, a real product deletion (or merge) at one end and the rows at the other.
 * Nothing here calls a subscriber directly — the wiring in `module.ts` is part of what is tested.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext, callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { fulfillmentOrdersOf, paidPreorderOrder } from '@modules/delivery/tests/factories';
import { cartService } from '@modules/cart';
import { wishlistService } from '@modules/wishlist';
import { notificationsService } from '@modules/notifications/services';
import { stockAlertService } from '@modules/stock-alerts';
import { inventoryService } from '@modules/inventory';
import { api, authenticateAs } from '@tests/http';
import { userService } from '@modules/users';
import { registerModules } from '@kernel/registry';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { notificationModel } from '../../model';
import { settleOutboxNudges } from '@kernel/outbox';
import { enabledModules } from '../../../../modules';

setupTestDb();

/** A user's inbox, newest first. */
/** A `fulfillment_order.hold_noticed` fact for `userId`, absent for an erased account. */
const heldFor = (userId: string | undefined) => ({
    orderId: 'order-1',
    fulfillmentOrderId: 'fo-1',
    ...(userId ? { userId } : {}),
    notice: 'check_address' as const,
    message: 'Is the flat number right?'
});

const inboxOf = (userId: string) => notificationsService.list(userId).then(({ items }) => items);

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
            await cartService.addItemById(holder.id, String(doomed._id), 2);

            await productService.removeById(String(doomed._id), true);

            await settleOutboxNudges();

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
            await wishlistService.add(saver.id, String(doomed._id), testCallerContext);

            await productService.removeById(String(doomed._id), true);

            await settleOutboxNudges();

            const [message] = await inboxOf(saver.id);
            expect(message).toMatchObject({
                code: 'notifications.wishlist-item-removed',
                params: { productId: String(doomed._id), titles: { en: 'Blue mug' } }
            });
        });

        it('writes both messages for a user who held the product in both lists', async () => {
            const user = await createUser();
            const doomed = await createProduct({ title: 'Blue mug' });
            await cartService.addItemById(user.id, String(doomed._id), 1);
            await wishlistService.add(user.id, String(doomed._id), testCallerContext);

            await productService.removeById(String(doomed._id), true);

            await settleOutboxNudges();

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
            await cartService.addItemById(holder.id, String(hidden._id), 1);

            await productService.removeById(String(hidden._id), false);

            await settleOutboxNudges();

            await expect(inboxOf(holder.id)).resolves.toHaveLength(1);
        });

        it('writes nothing when no list held the product', async () => {
            const user = await createUser();
            const unheld = await createProduct();

            await productService.removeById(String(unheld._id), true);

            await settleOutboxNudges();

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
            await settleOutboxNudges();
            await productService.removeById(String(hidden._id), false);
            await settleOutboxNudges();

            await cartService.merge(
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

            await cartService.merge(
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
            await cartService.addItemById(user.id, String(full._id), 999);

            await cartService.merge(
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

            await cartService.merge(
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
        await cartService.addItemById(user.id, String(product._id), 1);
        await productService.removeById(String(product._id), true);
        await settleOutboxNudges();
        await expect(inboxOf(user.id)).resolves.toHaveLength(1);

        await userService.removeById(user.id, true, callerContextAs('admin'));

        await expect(inboxOf(user.id)).resolves.toEqual([]);
    });

    describe('a back-in-stock request', () => {
        it('tells the asker once, naming the product, when it can be ordered again', async () => {
            const { user: asker, bearer } = await authenticateAs();
            const product = await createProduct({ title: 'Red lamp', onHand: 0 });
            const productId = String(product._id);
            await api().post(`/stock-alerts/${productId}`).set('Authorization', bearer);

            await inventoryService.receive(productId, 2, undefined, testCallerContext);
            await settleOutboxNudges();
            await stockAlertService.onBuyableAgain(productId);
            await settleOutboxNudges();

            const [message, ...rest] = await inboxOf(asker.id);
            expect(rest).toEqual([]);
            expect(message).toMatchObject({
                code: 'notifications.stock-alert',
                params: { productId, titles: expect.any(Object) }
            });
        });
    });

    describe('a late preorder', () => {
        const DAY = 86_400_000;

        /** A paid preorder promised in 30 days, its fulfillment orders made, and its date moved. */
        const moved = async (days: number) => {
            const placed = await paidPreorderOrder([
                { quantity: 2, releaseDate: new Date(Date.now() + 30 * DAY) }
            ]);
            await fulfillmentOrdersOf(placed.orderId);
            await productService.updateById(
                placed.productIds[0],
                { releaseDate: new Date(Date.now() + days * DAY).toISOString() },
                testCallerContext
            );
            await settleOutboxNudges();
            return placed;
        };

        it('tells the buyer of a short slip with fulfillment-delayed, naming the dates and the product', async () => {
            const { user, orderId } = await moved(40);

            const [message, ...rest] = await inboxOf(user.id);

            expect(rest).toEqual([]);
            expect(message).toMatchObject({
                code: 'notifications.fulfillment-delayed',
                severity: 'warning',
                params: { orderId, titles: [expect.any(String)] }
            });
            expect(message?.params).toHaveProperty('agreedAt');
            expect(message?.params).toHaveProperty('expectedAt');
            expect(message?.params).not.toHaveProperty('answerBy');
        });

        it('asks a long slip with fulfillment-confirm-wait, carrying the deadline', async () => {
            const { user } = await moved(90);

            const [message] = await inboxOf(user.id);

            expect(message?.code).toBe('notifications.fulfillment-confirm-wait');
            expect(message?.params).toHaveProperty('answerBy');
        });

        it('writes no row at all for a buyer whose account was erased', async () => {
            await emitDomainEvent('fulfillment_order.delayed', {
                orderId: 'order-1',
                fulfillmentOrderId: 'fo-1',
                titles: ['Blue mug'],
                agreedAt: new Date().toISOString(),
                reason: 'moved',
                needsAnswer: false
            });

            // Not an inbox read: a stray row would belong to a made-up owner nobody can open.
            await expect(notificationModel.countDocuments({})).resolves.toBe(0);
        });

        it('writes nothing when the date moves earlier', async () => {
            const { user } = await moved(10);

            await expect(inboxOf(user.id)).resolves.toEqual([]);
        });
    });

    describe('a hold the buyer can act on', () => {
        it('lands in the buyer inbox with the notice and the shop’s message, never a reason', async () => {
            const user = await createUser();

            await emitDomainEvent('fulfillment_order.hold_noticed', heldFor(user.id));

            const [message, ...rest] = await inboxOf(user.id);
            expect(rest).toEqual([]);
            expect(message).toMatchObject({
                code: 'notifications.fulfillment-held',
                severity: 'warning',
                params: {
                    orderId: 'order-1',
                    notice: 'check_address',
                    message: 'Is the flat number right?'
                }
            });
            expect(JSON.stringify(message)).not.toMatch(/reason/i);
        });

        it('writes no row at all for a buyer whose account was erased', async () => {
            await emitDomainEvent('fulfillment_order.hold_noticed', heldFor(undefined));

            await expect(notificationModel.countDocuments({})).resolves.toBe(0);
        });
    });
});
