/**
 * @module
 * Payments service (`src/modules/payments/service.ts`) — pins the invariants: the intent freezes
 * the ORDER's total (shipping included), a confirm moves the order `pending → paid` conditionally
 * so the payment row only says `succeeded` when the order does, a decline is retryable rather than
 * an error path, and a refund (the `ORDER_CANCELLED` listener) is at-most-once.
 *
 * Real Mongo throughout (`setupTestDb`), because the guarantees are the conditional writes. The
 * provider is the real `fake` one: its magic cards ARE its contract.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { orderService, orderRepository } from '@modules/orders';
import { productRepository } from '@modules/products';
import {
    createIntent,
    confirmPayment,
    getForOrder,
    refundByOrder
} from '@modules/payments/service';
import { paymentRepository } from '@modules/payments/repository';
import { FAKE_DECLINE_CARD } from '@modules/payments/providers/fake';
import paymentsModule from '@modules/payments/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';
import type { ResponseReject } from '@infrastructure/http/response';

setupTestDb();

const GOOD_CARD = '4242 4242 4242 4242';

const asReject = (result: unknown) => result as ResponseReject;

/** One paying customer with one two-line order, the fixture most tests start from. */
const orderFor = async (price = 25, quantity = 2) => {
    const user = await createUser();
    const product = await createProduct({ price });
    const order = await createOrder(user, [toOrderItem(product, quantity)]);
    return { user, order };
};

const auth = (user: { id: string }) => ({ id: user.id, admin: false });

/** A customer who paid: intent, then a good card. The fixture the money tests start from. */
const paidOrder = async () => {
    const { user, order } = await orderFor();
    const intent = await createIntent(String(order._id), auth(user));
    await confirmPayment(
        String((intent as { data?: { _id?: unknown } }).data?._id),
        { cardNumber: GOOD_CARD },
        auth(user),
        testCallerContext
    );
    return { user, order };
};

describe('createIntent', () => {
    it('freezes the order total into the intent', async () => {
        const { user, order } = await orderFor(25, 2);

        const result = await createIntent(String(order._id), auth(user));

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        // The order's own arithmetic — 2 × 25 — not a number the intent computed for itself.
        expect(payment!.amount).toBe(50);
        expect(payment!.status).toBe('requires_confirmation');
    });

    /**
     * The under-charge, pinned against the number the customer was shown rather than against a
     * literal. `totalPrice` is what `openapi.yaml` publishes and what the order page renders, and
     * for as long as the intent summed the lines on its own, every shop built on this boilerplate
     * charged the basket and gave the shipping away — on every non-free order, silently, because
     * the two numbers were computed in two files that no test compared.
     */
    it('charges the total the order publishes, shipping included', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 50 });
        const order = await createOrder(user, [toOrderItem(product, 2)], {
            shippingMethod: 'express',
            shippingCost: 15
        });

        const result = await createIntent(String(order._id), auth(user));

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        const { totalPrice } = order.toJSON() as { totalPrice: number };
        expect(totalPrice).toBe(115);
        expect(payment!.amount).toBe(totalPrice);
    });

    it('answers the same intent when asked twice — one payment per order is a database fact', async () => {
        const { user, order } = await orderFor();

        const first = await createIntent(String(order._id), auth(user));
        const second = await createIntent(String(order._id), auth(user));

        expect(first.success).toBe(true);
        expect(second.success).toBe(true);
        await expect(paymentRepository.count({})).resolves.toBe(1);
    });

    it('refuses an order that is not the caller`s as absence, not as forbidden', async () => {
        const { order } = await orderFor();
        const stranger = await createUser({ email: 'stranger@example.com' });

        const result = await createIntent(String(order._id), auth(stranger));

        expect(asReject(result).status).toBe(404);
    });

    it('refuses a non-pending order with the stable code', async () => {
        const { user, order } = await orderFor();
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'shipped');

        const result = await createIntent(String(order._id), auth(user));

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });
});

describe('confirmPayment', () => {
    it('moves the order to paid and the payment to succeeded, in that dependency', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        expect(intent.success).toBe(true);
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);

        const result = await confirmPayment(
            paymentId,
            { cardNumber: GOOD_CARD },
            auth(user),
            testCallerContext
        );

        expect(result.success).toBe(true);
        const storedOrder = await orderService.getById(String(order._id));
        expect(storedOrder!.status).toBe('paid');
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
        expect(payment!.cardLast4).toBe('4242');
    });

    it('reports a decline with the stable code, leaves the order pending, and stays retryable', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);

        const declined = await confirmPayment(
            paymentId,
            { cardNumber: FAKE_DECLINE_CARD },
            auth(user),
            testCallerContext
        );

        expect(asReject(declined).status).toBe(409);
        expect(asReject(declined).errors[0].code).toBe('PAYMENT_DECLINED');
        await expect(
            orderService.getById(String(order._id)).then((stored) => stored!.status)
        ).resolves.toBe('pending');

        // The decline is a state, not a dead end: the same document confirms with a better card.
        const retried = await confirmPayment(
            paymentId,
            { cardNumber: GOOD_CARD },
            auth(user),
            testCallerContext
        );
        expect(retried.success).toBe(true);
    });

    it('refuses a payment that is not the caller`s as absence', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        const stranger = await createUser({ email: 'stranger@example.com' });

        const result = await confirmPayment(
            paymentId,
            { cardNumber: GOOD_CARD },
            auth(stranger),
            testCallerContext
        );

        expect(asReject(result).status).toBe(404);
    });

    it('refuses a second confirm — the money already moved', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        await confirmPayment(paymentId, { cardNumber: GOOD_CARD }, auth(user), testCallerContext);

        const again = await confirmPayment(
            paymentId,
            { cardNumber: GOOD_CARD },
            auth(user),
            testCallerContext
        );

        expect(asReject(again).status).toBe(409);
        expect(asReject(again).errors[0].code).toBe('PAYMENT_NOT_CONFIRMABLE');
    });

    it('refuses a new intent once the money moved', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        await confirmPayment(paymentId, { cardNumber: GOOD_CARD }, auth(user), testCallerContext);

        const result = await createIntent(String(order._id), auth(user));

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });
});

describe('getForOrder', () => {
    it('answers the caller`s own payment and a stranger`s as absence', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const stranger = await createUser({ email: 'stranger@example.com' });

        const own = await getForOrder(String(order._id), auth(user));
        const other = await getForOrder(String(order._id), auth(stranger));

        expect(own.success).toBe(true);
        expect(asReject(other).status).toBe(404);
    });
});

/*
 * The refund rides the ORDER_CANCELLED event, and the subscription only exists once the
 * registry has run — a test that skipped `registerModules` would assert the refund never
 * happens and pass for the wrong reason (same shape as the cart's USER_DELETED suite).
 */
describe('refund on cancel', () => {
    beforeEach(() => {
        registerModules([
            accountModule,
            deliveryModule,
            productsModule,
            usersModule,
            inventoryModule,
            ordersModule,
            cartModule,
            paymentsModule
        ]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('cancelling a paid order refunds its payment', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        await confirmPayment(paymentId, { cardNumber: GOOD_CARD }, auth(user), testCallerContext);

        const cancelled = await orderService.cancelById(String(order._id), auth(user));

        expect(cancelled.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('refunded');
    });

    it('cancelling a never-paid order refunds nothing', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));

        const cancelled = await orderService.cancelById(String(order._id), auth(user));

        expect(cancelled.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        // The intent survives untouched — no money moved, so there is nothing to move back.
        expect(payment!.status).toBe('requires_confirmation');
    });
});

/**
 * Committing the order's held stock — the other thing a confirm does.
 *
 * These live here rather than in `cart/tests/unit/stock.test.ts` for the ordinary boundary
 * reason: committing is this service's work, and reaching `@modules/payments/service` from the
 * cart's suite is what `eslint-plugin-boundaries` forbids. The rest of
 * the lifecycle — checkout holds, cancel releases, the sweep expires — is asserted over there.
 *
 * The orders are placed through `orderService.create` rather than written as fixtures, because a
 * fixture order has no hold behind it and there would be nothing for a commit to claim. That is
 * the whole point being checked: units leave the shop if and only if they were paid for.
 */
/** Counters straight from the catalogue row, which is where the truth lives. */
const countersOf = async (productId: unknown) => {
    const stored = await productRepository.findByIdRaw(String(productId));
    return { onHand: stored?.onHand, reserved: stored?.reserved };
};

/** A real placed order: units held, nothing sold yet. */
const placedOrder = async (onHand = 10, quantity = 3) => {
    const user = await createUser();
    const product = await createProduct({ onHand });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity }],
        testCallerContext
    );
    return { user, product, order: created.data! };
};

const payFor = async (orderId: string, user: { id: string }) => {
    const intent = await createIntent(orderId, auth(user));
    return confirmPayment(
        String(intent.success && intent.data?._id),
        { cardNumber: GOOD_CARD },
        auth(user),
        testCallerContext
    );
};

describe('the confirm commits the order’s held units', () => {
    it('drops both counters together when the money lands', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3 });

        const paid = await payFor(String(order._id), user);

        expect(paid.success).toBe(true);
        // Availability is unchanged by the sale — those units stopped being sellable at checkout.
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0 });
    });

    it('leaves the hold alone when the card is declined', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        const intent = await createIntent(String(order._id), auth(user));

        const declined = await confirmPayment(
            String(intent.success && intent.data?._id),
            { cardNumber: FAKE_DECLINE_CARD },
            auth(user),
            testCallerContext
        );

        expect(declined.success).toBe(false);
        // Still held, not sold and not released: a decline is retryable state, and dropping the
        // hold here would let someone else take the units mid-retry.
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3 });
    });

    it('commits once even if the confirm is replayed', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?._id);

        await confirmPayment(paymentId, { cardNumber: GOOD_CARD }, auth(user), testCallerContext);
        await confirmPayment(paymentId, { cardNumber: GOOD_CARD }, auth(user), testCallerContext);

        // Seven, not four. Two guards refuse the replay independently — the order's conditional
        // `pending → paid` and the reservation's own `held → committed` claim.
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0 });
    });
});

describe('refundByOrder', () => {
    it('returns the money and leaves the order where it is', async () => {
        // The whole point of the standalone action: a goodwill refund is not a cancellation.
        const { order } = await paidOrder();

        const result = await refundByOrder(String(order._id), { admin: true }, testCallerContext);

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('refunded');
        const stored = await orderRepository.findById(String(order._id));
        expect(stored!.status).toBe('paid');
    });

    it('refuses the second attempt with 409 rather than paying twice', async () => {
        const { order } = await paidOrder();
        await refundByOrder(String(order._id), { admin: true }, testCallerContext);

        const result = await refundByOrder(String(order._id), { admin: true }, testCallerContext);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_NOT_REFUNDABLE');
    });

    it('refuses a payment that never succeeded with 409', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));

        const result = await refundByOrder(String(order._id), { admin: true }, testCallerContext);

        expect(asReject(result).status).toBe(409);
    });

    it('answers 404 when the order never had a payment', async () => {
        const { order } = await orderFor();

        const result = await refundByOrder(String(order._id), { admin: true }, testCallerContext);

        expect(asReject(result).status).toBe(404);
    });
});

describe('getForOrder — what the caller may do', () => {
    it('offers the operator a refund on money that arrived, once', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        await confirmPayment(
            String((intent as { data?: { _id?: unknown } }).data?._id),
            { cardNumber: GOOD_CARD },
            auth(user),
            testCallerContext
        );

        const before = await getForOrder(String(order._id), { admin: true });
        await refundByOrder(String(order._id), { admin: true }, testCallerContext);
        const after = await getForOrder(String(order._id), { admin: true });

        expect((before as { data?: Record<string, unknown> }).data?.actions).toMatchObject({
            refund: true
        });
        // What greys the control out — the client is told, rather than finding out by clicking.
        expect((after as { data?: Record<string, unknown> }).data?.actions).toMatchObject({
            refund: false
        });
    });

    it('never offers a customer the refund control', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        await confirmPayment(
            String((intent as { data?: { _id?: unknown } }).data?._id),
            { cardNumber: GOOD_CARD },
            auth(user),
            testCallerContext
        );

        const result = await getForOrder(String(order._id), auth(user));

        expect((result as { data?: Record<string, unknown> }).data?.actions).toMatchObject({
            refund: false
        });
    });

    it('offers `pay` while the intent stands and the order can still reach paid', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));

        const result = await getForOrder(String(order._id), auth(user));

        expect((result as { data?: Record<string, unknown> }).data?.actions).toMatchObject({
            pay: true
        });
    });

    it('withdraws `pay` once the order is cancelled, even with the intent still open', async () => {
        // Both halves of the question. A retryable intent on an order that can no longer reach
        // `paid` is not a payment anyone may complete.
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        await orderService.cancelById(String(order._id), auth(user));

        const result = await getForOrder(String(order._id), { admin: true });

        expect((result as { data?: Record<string, unknown> }).data?.actions).toMatchObject({
            pay: false
        });
    });
});
