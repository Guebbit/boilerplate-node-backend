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
import { giveAddress } from '@modules/addresses/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { cartService } from '../../services';
import { orderService } from '@modules/orders';
import { orderRepository, readOrder, countOrders } from '@modules/orders/tests/factories';
import { inventoryService } from '@modules/inventory';
import { cartRepository } from '@modules/cart/repository';
import { logger } from '@infrastructure/adapters/logger';
import { resetDomainEvents } from '@kernel/events';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext, callerContextAs } from '@tests/callers';

setupTestDb();

/*
 * The modules are registered so their subscriptions exist — specifically `orders` listening for
 * `RESERVATION_EXPIRED`, which is the only cross-module edge in this file that travels as an
 * event rather than a call. Without it the sweep would release units and leave the orders
 * `pending`, and the expiry cases would silently assert half the behaviour.
 */
beforeEach(() => {
    resetDomainEvents();
    registerCheckoutModules([paymentsModule]);
});

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
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);

        await cartRepository.setShippingMethod(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

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
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 2 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);

        await cartRepository.setShippingMethod(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'CART_INSUFFICIENT_STOCK',
            // Which line, and how much was asked for — the number left is not told to a shopper.
            // Without the line the customer is editing the cart by trial and error.
            details: {
                lines: [{ productId: String(product._id), title: product.title, requested: 3 }]
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
        await giveAddress(holder.id);
        const latecomer = await createUser({ email: 'late@example.com', username: 'late' });
        await giveAddress(latecomer.id);
        const product = await createProduct({ onHand: 4 });

        await cartService.cartItemAddById(holder.id, String(product._id), 4);
        await cartRepository.setShippingMethod(holder.id, 'pickup');
        const firstCheckout = await cartService.orderConfirm(
            holder.id,
            testCallerContext,
            undefined
        );
        expect(firstCheckout.success).toBe(true);

        await cartService.cartItemAddById(latecomer.id, String(product._id), 1);
        await cartRepository.setShippingMethod(latecomer.id, 'pickup');
        const result = await cartService.orderConfirm(latecomer.id, testCallerContext, undefined);

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
        await giveAddress(user.id);
        const shortA = await createProduct({ title: 'Short A', onHand: 1 });
        const shortB = await createProduct({ title: 'Short B', onHand: 2 });
        const fine = await createProduct({ title: 'Fine', onHand: 99 });
        await cartService.cartItemAddById(user.id, String(shortA._id), 5);
        await cartService.cartItemAddById(user.id, String(shortB._id), 5);
        await cartService.cartItemAddById(user.id, String(fine._id), 1);

        await cartRepository.setShippingMethod(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        const details = result.success ? undefined : result.errors[0].details;
        // Both short lines, with titles, and the healthy one absent — a customer trimming one
        // line only to be refused on the next is being made to binary-search their own basket.
        expect(details?.lines).toEqual([
            { productId: String(shortA._id), title: 'Short A', requested: 5 },
            { productId: String(shortB._id), title: 'Short B', requested: 5 }
        ]);
    });

    it('a failed line puts back what earlier lines already held', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const plenty = await createProduct({ title: 'Plenty', onHand: 50 });
        const scarce = await createProduct({ title: 'Scarce', onHand: 1 });
        await cartService.cartItemAddById(user.id, String(plenty._id), 2);
        await cartService.cartItemAddById(user.id, String(scarce._id), 2);

        await cartRepository.setShippingMethod(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(await countersOf(plenty._id)).toMatchObject({ reserved: 0, available: 50 });
        expect(await countersOf(scarce._id)).toMatchObject({ reserved: 0, available: 1 });
    });

    it('two checkouts cannot share the last unit', async () => {
        const alice = await createUser({ email: 'alice@example.com', username: 'alice' });
        await giveAddress(alice.id);
        const bob = await createUser({ email: 'bob@example.com', username: 'bob' });
        await giveAddress(bob.id);
        const lastOne = await createProduct({ onHand: 1 });
        await cartService.cartItemAddById(alice.id, String(lastOne._id), 1);
        await cartService.cartItemAddById(bob.id, String(lastOne._id), 1);
        await cartRepository.setShippingMethod(alice.id, 'pickup');
        await cartRepository.setShippingMethod(bob.id, 'pickup');

        const [first, second] = await Promise.all([
            cartService.orderConfirm(alice.id, testCallerContext, undefined),
            cartService.orderConfirm(bob.id, testCallerContext, undefined)
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
         * path that reports a shortfall read back at the moment it refused — and, like the
         * pre-flight, names the line without the number left, which a shopper is not told.
         */
        const loser = first.success ? second : first;
        const refusal = !loser.success && loser.errors[0];
        expect(refusal && refusal.code).toBe('CART_INSUFFICIENT_STOCK');
        // `toEqual`, not `toMatchObject`: an extra `available` on the line must fail.
        expect(refusal && refusal.details).toEqual({
            lines: [{ productId: String(lastOne._id), title: lastOne.title, requested: 1 }]
        });
    });
});

describe('a checkout that cannot keep its order', () => {
    /*
     * `clearMocks` empties the call log between tests but leaves implementations in place, so
     * the forced failures below have to be undone by hand.
     */
    afterEach(() => {
        jest.restoreAllMocks();
    });

    /*
     * The hold is taken BEFORE the order is written, so a refused reserve has no order to roll
     * back at all — `orderRepository.create`/`deleteOne` and the order-number counter are never
     * reached.
     */
    it('writes no order and burns no order number when the hold is refused', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 1 });
        await cartService.cartItemAddById(user.id, String(product._id), 2);
        const createSpy = jest.spyOn(orderRepository, 'create');
        const counterSpy = jest.spyOn(orderRepository, 'incrementOrderNumberCounter');

        await cartRepository.setShippingMethod(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(!result.success && result.errors[0]?.code).toBe('CART_INSUFFICIENT_STOCK');
        expect(createSpy).not.toHaveBeenCalled();
        expect(counterSpy).not.toHaveBeenCalled();
        expect(await countOrders({ userId: user._id })).toBe(0);
    });

    it('writes no order and leaves no hold when the cart moved under the checkout', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 5 });
        await cartService.cartItemAddById(user.id, String(product._id), 2);
        // The cart moved under this checkout: the clear matches nothing, so the order must not stand.
        jest.spyOn(cartRepository, 'clearLinesIfUnchanged').mockResolvedValue(null);

        await cartRepository.setShippingMethod(user.id, 'pickup');
        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        expect(!result.success && result.errors[0]?.code).toBe('CART_CHANGED');
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
        const counters = await countersOf(String(product._id));
        expect(counters.reserved).toBe(0);
    });

    it('lets the shopper retry without a second order when the cart clear itself fails', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 3);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
        jest.spyOn(cartRepository, 'clearLinesIfUnchanged').mockRejectedValueOnce(
            new Error('connection reset')
        );

        const failed = await cartService.orderConfirm(user.id, testCallerContext, undefined);
        const retried = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(failed.success).toBe(false);
        expect(retried.success).toBe(true);
        // One cart, one live order, one set of units held.
        await expect(countOrders({ userId: user._id })).resolves.toBe(1);
        const counters = await countersOf(String(product._id));
        expect(counters.reserved).toBe(3);
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
            callerContextAs('admin')
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
            callerContextAs('admin')
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
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 4);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        const checkout = await cartService.orderConfirm(user.id, testCallerContext, undefined);
        expect(await countersOf(product._id)).toMatchObject({ reserved: 4, available: 6 });

        const orderId = String(checkout.success && checkout.data?._id);
        const cancelled = await orderService.cancelById(orderId, asCustomer(user.id));

        expect(cancelled.success).toBe(true);
        expect(await countersOf(product._id)).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
    });

    it('a second cancel cannot release twice', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await createProduct({ onHand: 10 });
        await cartService.cartItemAddById(user.id, String(product._id), 4);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        const checkout = await cartService.orderConfirm(user.id, testCallerContext, undefined);
        const orderId = String(checkout.success && checkout.data?._id);

        await orderService.cancelById(orderId, asCustomer(user.id));
        const again = await orderService.cancelById(orderId, asCustomer(user.id));

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
        await giveAddress(user.id);
        const bought = await createProduct({ title: 'Bought', onHand: 10 });
        const untouched = await createProduct({ title: 'Untouched', onHand: 5 });
        await cartService.cartItemAddById(user.id, String(bought._id), 1);
        await cartRepository.setShippingMethod(user.id, 'pickup');
        const checkout = await cartService.orderConfirm(user.id, testCallerContext, undefined);
        const orderId = String(checkout.success && checkout.data?._id);

        await orderService.cancelById(orderId, asCustomer(user.id));

        expect(await countersOf(bought._id)).toMatchObject({ onHand: 10, reserved: 0 });
        expect(await countersOf(untouched._id)).toMatchObject({ onHand: 5, reserved: 0 });
        // The order really is cancelled, not merely refunded on the shelf.
        const stored = await readOrder(orderId);
        expect(stored?.status).toBe('cancelled');
    });

    it('a customer cancel racing the expiry sweep releases the hold exactly once', async () =>
        withoutWindow(async () => {
            const user = await createUser();
            await giveAddress(user.id);
            const product = await createProduct({ onHand: 10 });
            await cartService.cartItemAddById(user.id, String(product._id), 4);
            await cartRepository.setShippingMethod(user.id, 'pickup');
            const checkout = await cartService.orderConfirm(user.id, testCallerContext, undefined);
            const orderId = String(checkout.success && checkout.data?._id);

            /*
             * Both paths call `cancelById` on the SAME order — the sweep's own admin-scoped
             * cancel fires from inside `runReservationSweep` via the `RESERVATION_EXPIRED`
             * subscription. Whichever wins `updateStatusIfIn` cancels the order; the loser
             * no-ops on a status that has already moved. `claimStatus('held', 'released')`
             * guards the reservation the same way, independent of which side wins the order
             * race — so the units come back exactly once either way.
             */
            await Promise.all([
                orderService.cancelById(orderId, asCustomer(user.id)),
                inventoryService.runReservationSweep()
            ]);

            const stored = await readOrder(orderId);
            expect(stored?.status).toBe('cancelled');
            // Not 14 (double release) and not 4 (never released) — exactly the held 4 back.
            expect(await countersOf(product._id)).toEqual({
                onHand: 10,
                reserved: 0,
                available: 10
            });
        }));
});

describe('the expiry sweep', () => {
    it('releases a stale hold and cancels the order behind it', async () =>
        withoutWindow(async () => {
            const user = await createUser();
            await giveAddress(user.id);
            const product = await createProduct({ onHand: 10 });
            await cartService.cartItemAddById(user.id, String(product._id), 4);
            await cartRepository.setShippingMethod(user.id, 'pickup');
            const checkout = await cartService.orderConfirm(user.id, testCallerContext, undefined);
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
            const stored = await readOrder(orderId);
            expect(stored?.status).toBe('cancelled');
        }));

    it('is idempotent — a second sweep releases nothing', async () =>
        withoutWindow(async () => {
            const user = await createUser();
            await giveAddress(user.id);
            const product = await createProduct({ onHand: 10 });
            await cartService.cartItemAddById(user.id, String(product._id), 4);
            await cartRepository.setShippingMethod(user.id, 'pickup');
            await cartService.orderConfirm(user.id, testCallerContext, undefined);

            await inventoryService.runReservationSweep();
            const second = await inventoryService.runReservationSweep();

            expect(second).toBe(0);
            expect(await countersOf(product._id)).toMatchObject({ onHand: 10, reserved: 0 });
        }));
});

/** A sellable product (the catalogue cache says 10 on hand) whose level row is gone. */
const productWithoutLevelRow = async () => {
    const product = await createProduct({ onHand: 10 });
    await inventoryService.removeLevel(String(product._id));
    return product;
};

describe('a product with no stock-level row', () => {
    it('is refused by checkout, not sold with nothing set aside', async () => {
        const user = await createUser();
        await giveAddress(user.id);
        const product = await productWithoutLevelRow();
        await cartService.cartItemAddById(user.id, String(product._id), 3);
        await cartRepository.setShippingMethod(user.id, 'pickup');

        const result = await cartService.orderConfirm(user.id, testCallerContext, undefined);

        expect(result.success).toBe(false);
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
    });

    it('is refused by the admin order create, not sold with nothing set aside', async () => {
        const user = await createUser();
        const product = await productWithoutLevelRow();

        const result = await orderService.create(
            user.id,
            user.email,
            [{ productId: String(product._id), quantity: 3 }],
            callerContextAs('admin')
        );

        expect(result.success).toBe(false);
        await expect(countOrders({ userId: user._id })).resolves.toBe(0);
    });
});
