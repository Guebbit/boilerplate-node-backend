/**
 * @module
 * Stock across the whole order lifecycle — the reservation model's behavioural suite. The
 * invariant under test: units leave the shop only once PAID for; between checkout and payment
 * they are held, not sold, and recoverable by cancel or expiry sweep. Every case asserts
 * `onHand` and `reserved` together, since either alone can pass for a shop that never reserved.
 * Real Mongo throughout — the guarantees are conditional writes a mock can't show.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { cartService } from '@modules/cart';
import { productRepository } from '@modules/products';
import { orderService, orderRepository } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import paymentsModule from '@modules/payments/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';

setupTestDb();

/*
 * The modules are registered so their subscriptions exist — specifically `orders` listening for
 * `RESERVATION_EXPIRED`, which is the only cross-module edge in this file that travels as an
 * event rather than a call. Without it the sweep would release units and leave the orders
 * `pending`, and the expiry cases would silently assert half the behaviour.
 */
beforeEach(() => {
    resetDomainEvents();
    registerModules([
        accountModule,
        cartModule,
        deliveryModule,
        inventoryModule,
        ordersModule,
        paymentsModule,
        productsModule,
        usersModule
    ]);
});

/** Both counters and the number derived from them — what every assertion here reads. */
const countersOf = async (productId: unknown) => {
    const stored = await productRepository.findByIdRaw(String(productId));
    return {
        onHand: stored?.onHand,
        reserved: stored?.reserved,
        available: (stored?.onHand ?? 0) - (stored?.reserved ?? 0)
    };
};

/**
 * Run `body` with the reservation window closed, so every hold it opens is already stale by the
 * time the sweep reads it. Scoped rather than set globally: the TTL is read lazily on each reserve
 * precisely so a test can vary it, and leaving it at zero would make every case above expire
 * mid-run.
 */
const withoutWindow = (body: () => Promise<void>) =>
    withEnvironment('NODE_RESERVATION_TTL_MINUTES', '0', body);

describe('checkout holds units without selling them', () => {
    it('a completed checkout reserves the ordered units and takes none off the shelf', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(true);
        // THE assertion of the whole rework: the units are spoken for, not gone.
        expect(await countersOf(product._id)).toEqual({
            onHand: 10,
            reserved: 3,
            available: 7
        });
    });

    it('refuses a cart over what is available and moves nothing', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 2 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'CART_INSUFFICIENT_STOCK',
            // Which line, and what is actually left. Without this the customer is editing the
            // cart by trial and error.
            details: {
                lines: [
                    {
                        productId: String(product._id),
                        requested: 3,
                        available: 2
                    }
                ]
            }
        });
        expect(await countersOf(product._id)).toEqual({
            onHand: 2,
            reserved: 0,
            available: 2
        });
        // And the cart survives — a refused checkout is not a lost basket.
        const cart = await cartService.cartGetForBadge(user.id);
        expect(cart.items).toEqual([{ productId: String(product._id), quantity: 3 }]);
    });

    it('refuses a product whose units are all held by someone else', async () => {
        const holder = await createUser({ email: 'holder@example.com', username: 'holder' });
        const latecomer = await createUser({ email: 'late@example.com', username: 'late' });
        const product = await createProduct({ onHand: 4 });

        await cartService.cartItemAddById(holder.id, String(product._id), 4);
        const firstCheckout = await cartService.orderConfirm(holder.id, testCallerContext);
        expect(firstCheckout.success).toBe(true);

        await cartService.cartItemAddById(latecomer.id, String(product._id), 1);
        const result = await cartService.orderConfirm(latecomer.id, testCallerContext);

        // Four units are physically present and none of them is for sale. This is the state the
        // single-`stock` model had no way to represent.
        expect(result.success).toBe(false);
        expect(await countersOf(product._id)).toEqual({
            onHand: 4,
            reserved: 4,
            available: 0
        });
    });

    it('names every short line at once, not just the first', async () => {
        const user = await createUser();
        const shortA = await createProduct({ title: 'Short A', onHand: 1 });
        const shortB = await createProduct({ title: 'Short B', onHand: 2 });
        const fine = await createProduct({ title: 'Fine', onHand: 99 });
        await cartService.cartItemAddById(user.id, String(shortA._id), 5);
        await cartService.cartItemAddById(user.id, String(shortB._id), 5);
        await cartService.cartItemAddById(user.id, String(fine._id), 1);

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(false);
        const details = result.success ? undefined : result.errors[0].details;
        // Both short lines, with titles, and the healthy one absent — a customer trimming one
        // line only to be refused on the next is being made to binary-search their own basket.
        expect(details?.lines).toEqual([
            { productId: String(shortA._id), title: 'Short A', requested: 5, available: 1 },
            { productId: String(shortB._id), title: 'Short B', requested: 5, available: 2 }
        ]);
    });

    it('a failed line puts back what earlier lines already held', async () => {
        const user = await createUser();
        const plenty = await createProduct({ title: 'Plenty', onHand: 50 });
        const scarce = await createProduct({ title: 'Scarce', onHand: 1 });
        await cartService.cartItemAddById(user.id, String(plenty._id), 2);
        await cartService.cartItemAddById(user.id, String(scarce._id), 2);

        const result = await cartService.orderConfirm(user.id, testCallerContext);

        expect(result.success).toBe(false);
        expect(await countersOf(plenty._id)).toMatchObject({ reserved: 0, available: 50 });
        expect(await countersOf(scarce._id)).toMatchObject({ reserved: 0, available: 1 });
    });

    it('two checkouts cannot share the last unit', async () => {
        const alice = await createUser({ email: 'alice@example.com', username: 'alice' });
        const bob = await createUser({ email: 'bob@example.com', username: 'bob' });
        const lastOne = await createProduct({ onHand: 1 });
        await cartService.cartItemAddById(alice.id, String(lastOne._id), 1);
        await cartService.cartItemAddById(bob.id, String(lastOne._id), 1);

        const [first, second] = await Promise.all([
            cartService.orderConfirm(alice.id, testCallerContext),
            cartService.orderConfirm(bob.id, testCallerContext)
        ]);

        const outcomes = [first.success, second.success].toSorted();
        expect(outcomes).toEqual([false, true]);
        // Exactly one hold, and the unit is still physically there — it leaves on payment.
        expect(await countersOf(lastOne._id)).toEqual({
            onHand: 1,
            reserved: 1,
            available: 0
        });

        /*
         * The loser is refused by the RESERVE, not by the pre-flight — both pre-flights saw the
         * unit as available, which is the whole point of the conditional write. So this is the
         * path that reports a shortfall read back at the moment it refused, and `available: 0` is
         * the state the winner left behind rather than anything the loser saw earlier.
         */
        const loser = first.success ? second : first;
        expect(!loser.success && loser.errors[0]).toMatchObject({
            code: 'CART_INSUFFICIENT_STOCK',
            details: {
                lines: [{ productId: String(lastOne._id), requested: 1, available: 0 }]
            }
        });
    });
});

describe('the admin order create holds units like checkout', () => {
    it('reserves rather than selling — the manual path sells the same shelf', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 10 });

        const result = await orderService.create(
            user.id,
            user.email,
            [{ productId: String(product._id), quantity: 4 }],
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await countersOf(product._id)).toEqual({
            onHand: 10,
            reserved: 4,
            available: 6
        });
    });

    it('refuses and rolls back when a line exceeds what is available', async () => {
        const user = await createUser();
        const plenty = await createProduct({ title: 'Plenty', onHand: 50 });
        const scarce = await createProduct({ title: 'Scarce', onHand: 1 });

        const result = await orderService.create(
            user.id,
            user.email,
            [
                { productId: String(plenty._id), quantity: 2 },
                { productId: String(scarce._id), quantity: 5 }
            ],
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        // The admin path names the blocker too — it sells the same shelf and refuses the same way.
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'ORDER_INSUFFICIENT_STOCK',
            details: {
                lines: [{ productId: String(scarce._id), requested: 5, available: 1 }]
            }
        });
        expect(await countersOf(plenty._id)).toMatchObject({ reserved: 0, available: 50 });
        expect(await countersOf(scarce._id)).toMatchObject({ reserved: 0, available: 1 });
    });
});

describe('cancel releases the hold', () => {
    it('a cancelled unpaid order gives its units back', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 4);
        const checkout = await cartService.orderConfirm(user.id, testCallerContext);
        expect(await countersOf(product._id)).toMatchObject({ reserved: 4, available: 6 });

        const orderId = String(checkout.success && checkout.data?._id);
        const cancelled = await orderService.cancelById(orderId, { id: user.id, admin: false });

        expect(cancelled.success).toBe(true);
        expect(await countersOf(product._id)).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
    });

    it('a second cancel cannot release twice', async () => {
        const user = await createUser();
        const product = await createProduct({ onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 4);
        const checkout = await cartService.orderConfirm(user.id, testCallerContext);
        const orderId = String(checkout.success && checkout.data?._id);

        await orderService.cancelById(orderId, { id: user.id, admin: false });
        const again = await orderService.cancelById(orderId, { id: user.id, admin: false });

        expect(again.success).toBe(false);
        // Not 14, which is what an unconditional put-back would have produced.
        expect(await countersOf(product._id)).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
    });

    it("cancelling one order does not disturb other products' counters", async () => {
        const user = await createUser();
        const bought = await createProduct({ title: 'Bought', onHand: 10 });
        const untouched = await createProduct({ title: 'Untouched', onHand: 5 });
        await cartService.cartItemAddById(user.id, String(bought._id), 1);
        const checkout = await cartService.orderConfirm(user.id, testCallerContext);
        const orderId = String(checkout.success && checkout.data?._id);

        await orderService.cancelById(orderId, { id: user.id, admin: false });

        expect(await countersOf(bought._id)).toMatchObject({ onHand: 10, reserved: 0 });
        expect(await countersOf(untouched._id)).toMatchObject({ onHand: 5, reserved: 0 });
        // The order really is cancelled, not merely refunded on the shelf.
        const stored = await orderRepository.findById(orderId);
        expect(stored?.status).toBe('cancelled');
    });
});

describe('the expiry sweep', () => {
    it('releases a stale hold and cancels the order behind it', async () =>
        withoutWindow(async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 10 });
            await cartService.cartItemAddById(user.id, String(product._id), 4);
            const checkout = await cartService.orderConfirm(user.id, testCallerContext);
            const orderId = String(checkout.success && checkout.data?._id);

            const expired = await inventoryService.runReservationSweep();

            expect(expired).toBe(1);
            expect(await countersOf(product._id)).toEqual({
                onHand: 10,
                reserved: 0,
                available: 10
            });
            /*
             * The other half, and the reason the sweep announces rather than only releasing: an
             * order left `pending` with its stock gone would tell the customer they had bought
             * something they had not. This assertion is what proves the `RESERVATION_EXPIRED`
             * subscription is wired.
             */
            const stored = await orderRepository.findById(orderId);
            expect(stored?.status).toBe('cancelled');
        }));

    it('is idempotent — a second sweep releases nothing', async () =>
        withoutWindow(async () => {
            const user = await createUser();
            const product = await createProduct({ onHand: 10 });
            await cartService.cartItemAddById(user.id, String(product._id), 4);
            await cartService.orderConfirm(user.id, testCallerContext);

            await inventoryService.runReservationSweep();
            const second = await inventoryService.runReservationSweep();

            expect(second).toBe(0);
            expect(await countersOf(product._id)).toMatchObject({ onHand: 10, reserved: 0 });
        }));
});
