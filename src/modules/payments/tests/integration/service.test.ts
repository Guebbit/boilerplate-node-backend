/**
 * @module
 * Payments service (`src/modules/payments/service.ts`) — pins the invariants: the intent freezes
 * the ORDER's total (shipping included), a confirm moves the order `pending → paid` conditionally
 * so the payment row only says `succeeded` when the order does, a decline is retryable, and a
 * refund (the `ORDER_CANCELLED` listener) is at-most-once. Real Mongo throughout, because the
 * guarantees are the conditional writes; the provider is the real `fake` one.
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
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement,
    getForOrder,
    refundByOrder
} from '@modules/payments/service';
import { paymentRepository } from '@modules/payments/repository';
import { FAKE_DECLINE_METHOD, fakePaymentProvider } from '@modules/payments/providers/fake';
import paymentsModule from '@modules/payments/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import accountModule from '@modules/account/module';
import cartModule from '@modules/cart/module';
import deliveryModule from '@modules/delivery/module';
import type { ResponseReject } from '@infrastructure/http/response';
import { asCustomer, asOwner } from '../../../../../tests/support/callers';

setupTestDb();

/** The reference the demo's own panel sends — an opaque handle, never a card number. */
const GOOD_METHOD = 'pm_card_visa';

const asReject = (result: unknown) => result as ResponseReject;

/** One paying customer with one two-line order, the fixture most tests start from. */
const orderFor = async (price = 25, quantity = 2) => {
    const user = await createUser();
    const product = await createProduct({ price });
    const order = await createOrder(user, [toOrderItem(product, quantity)]);
    return { user, order };
};

const auth = (user: { id: string }) => asCustomer(user.id);

/** A customer who paid: intent, then a good card. The fixture the money tests start from. */
const paidOrder = async () => {
    const { user, order } = await orderFor();
    const intent = await createIntent(String(order._id), auth(user));
    await confirmPayment(
        String((intent as { data?: { id?: string } }).data?.id),
        GOOD_METHOD,
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

        const result = await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

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
            FAKE_DECLINE_METHOD,
            auth(user),
            testCallerContext
        );

        expect(asReject(declined).status).toBe(409);
        expect(asReject(declined).errors[0].code).toBe('PAYMENT_DECLINED');
        await expect(
            orderService.getById(String(order._id)).then((stored) => stored!.status)
        ).resolves.toBe('pending');

        // The decline is a state, not a dead end: the same document confirms with a better card.
        const retried = await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);
        expect(retried.success).toBe(true);
    });

    it('refuses a payment that is not the caller`s as absence', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        const stranger = await createUser({ email: 'stranger@example.com' });

        const result = await confirmPayment(
            paymentId,
            GOOD_METHOD,
            auth(stranger),
            testCallerContext
        );

        expect(asReject(result).status).toBe(404);
    });

    it('refuses a second confirm — the money already moved', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        const again = await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        expect(asReject(again).status).toBe(409);
        expect(asReject(again).errors[0].code).toBe('PAYMENT_NOT_CONFIRMABLE');
    });

    it('refuses a new intent once the money moved', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        const result = await createIntent(String(order._id), auth(user));

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });

    it('refunds a charge whose order slipped away between opening the intent and confirming', async () => {
        // The order is cancelled in the window between opening the intent and confirming — module
        // docblock rule 2: the provider takes the money, the conditional `paid` move loses to the
        // order no longer being payable-into, and it is handed straight back.
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String((intent as { data?: { id?: string } }).data?.id);
        await orderService.cancelById(String(order._id), auth(user));

        const refundSpy = jest.spyOn(fakePaymentProvider, 'refund');
        const result = await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
        expect(refundSpy).toHaveBeenCalledTimes(1);
        // The reference comes off the ROW, not the answer: it is deliberately not published, so a
        // test reading it from the response would be asserting a leak.
        const prepared = await paymentRepository.findByOrderId(String(order._id));
        expect(refundSpy).toHaveBeenCalledWith(prepared!.providerRef, {
            amount: (intent as { data?: { amount?: number } }).data?.amount,
            currency: (intent as { data?: { currency?: string } }).data?.currency
        });
        refundSpy.mockRestore();

        // `refunded`, not back to `requires_confirmation`: the money DID move at the provider, and
        // a row that says it never did is a row nobody can reconcile against a statement. It is
        // also terminal, which is what stops the customer paying a cancelled order twice.
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('refunded');
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
        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

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

    it('pins refunded as terminal against a webhook that arrives after the cancel refund', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const providerRef = String(
            (await paymentRepository.findByOrderId(String(order._id)))!.providerRef
        );
        const paymentId = String((await paymentRepository.findByOrderId(String(order._id)))!._id);
        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);
        await orderService.cancelById(String(order._id), auth(user));

        // The setup this test actually cares about: cancelling really did refund it already.
        expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe('refunded');

        // The webhook arrives unbidden and late — the browser-driven confirm already settled and
        // the cancel already refunded it by the time the provider's own callback catches up.
        await applyWebhookSettlement(providerRef, { status: 'succeeded', cardLast4: '4242' });

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('refunded');
        const stored = await orderRepository.findById(String(order._id));
        expect(stored!.status).not.toBe('paid');
    });
});

/**
 * Committing the order's held stock — the other thing a confirm does. Lives here, not in
 * `cart/tests/unit/stock.test.ts`, because reaching `@modules/payments/service` from that suite
 * is what `eslint-plugin-boundaries` forbids. Orders are placed via `orderService.create` rather
 * than fixtures, so there is a real hold for the commit to claim.
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
        String(intent.success && intent.data?.id),
        GOOD_METHOD,
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
            String(intent.success && intent.data?.id),
            FAKE_DECLINE_METHOD,
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
        const paymentId = String(intent.success && intent.data?.id);

        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);
        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        // Seven, not four. Two guards refuse the replay independently — the order's conditional
        // `pending → paid` and the reservation's own `held → committed` claim.
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0 });
    });

    it('commits once when the webhook and the browser settle the same payment', async () => {
        // The reason `settlePayment` exists as ONE function: the provider's callback and the
        // browser's own "I finished" call race routinely, and two copies of this choreography
        // would each commit the hold.
        const { user, product, order } = await placedOrder(10, 3);
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?.id);
        const providerRef = String(
            (await paymentRepository.findByOrderId(String(order._id)))!.providerRef
        );
        await confirmPayment(
            paymentId,
            'pm_card_authentication_required',
            auth(user),
            testCallerContext
        );

        await applyWebhookSettlement(providerRef, { status: 'succeeded', cardLast4: '3155' });
        await syncPayment(paymentId, auth(user), testCallerContext);

        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0 });
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
    });

    it('commits once when the browser settles before the webhook — the reverse race', async () => {
        // Same choreography as the test above, arriving in the other order: the browser polls
        // `syncPayment` and wins the race, then the webhook's own delivery of the same outcome
        // arrives after. `settlePayment`'s idempotence must hold from either direction, not just
        // the one the test above happens to cover.
        const { user, product, order } = await placedOrder(10, 3);
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?.id);
        const providerRef = String(
            (await paymentRepository.findByOrderId(String(order._id)))!.providerRef
        );
        await confirmPayment(
            paymentId,
            'pm_card_authentication_required',
            auth(user),
            testCallerContext
        );

        await syncPayment(paymentId, auth(user), testCallerContext);
        await applyWebhookSettlement(providerRef, { status: 'succeeded', cardLast4: '3155' });

        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0 });
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
    });
});

/**
 * The two states a payment can sit in while the customer is still working — a bank challenge, or
 * a method that settles over days. Neither may touch the order, and both are successes on the
 * wire: a 4xx would tell the browser to stop, and the browser is the only thing that can finish.
 */
describe('in-flight settlement', () => {
    it('records a challenge without paying the order', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?.id);

        const result = await confirmPayment(
            paymentId,
            'pm_card_authentication_required',
            auth(user),
            testCallerContext
        );

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('requires_action');
        const stored = await orderRepository.findById(String(order._id));
        expect(stored!.status).toBe('pending');
    });

    it('records an asynchronous method as processing, order still unpaid', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?.id);

        const result = await confirmPayment(
            paymentId,
            'pm_card_processing',
            auth(user),
            testCallerContext
        );

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('processing');
        const stored = await orderRepository.findById(String(order._id));
        expect(stored!.status).toBe('pending');
    });

    it('does not offer the pay action again while a payment is in flight', async () => {
        // Offering the form back is how a customer pays twice: the browser is mid-challenge at
        // the provider, and a second method attached here would open a second charge.
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        await confirmPayment(
            String(intent.success && intent.data?.id),
            'pm_card_authentication_required',
            auth(user),
            testCallerContext
        );

        const result = await getForOrder(String(order._id), auth(user));

        expect(result.success && result.data?.actions?.pay).toBe(false);
    });

    it('refuses to attach a second method to a payment already in flight', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?.id);
        await confirmPayment(
            paymentId,
            'pm_card_authentication_required',
            auth(user),
            testCallerContext
        );

        const second = await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        expect(asReject(second).status).toBe(409);
        expect(asReject(second).errors[0].code).toBe('PAYMENT_NOT_CONFIRMABLE');
    });
});

/**
 * `syncPayment`'s own two refusal branches — the provider saying no, and there being no provider
 * to ask at all.
 */
describe('syncPayment', () => {
    it('answers a provider decline as 409, leaving the order pending and the hold held', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?.id);
        // In flight: the bank hasn't answered yet, so nothing has touched the order or the hold.
        await confirmPayment(paymentId, 'pm_card_processing', auth(user), testCallerContext);

        // The provider's own eventual answer, forced rather than awaited — this is the outcome a
        // real async method CAN settle to, not one `pm_card_processing`'s own fixture produces.
        const retrieveSpy = jest
            .spyOn(fakePaymentProvider, 'retrieve')
            .mockResolvedValueOnce({ status: 'declined' });

        const result = await syncPayment(paymentId, auth(user), testCallerContext);
        retrieveSpy.mockRestore();

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_DECLINED');
        expect((await orderRepository.findById(String(order._id)))!.status).toBe('pending');
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3 });
    });

    it('refuses to sync a row the provider was never asked to open', async () => {
        // Built straight off the repository, skipping createIntent — so there is no providerRef,
        // which is the one thing this branch exists to catch before it ever reaches the provider.
        const { user, order } = await orderFor();
        const payment = await paymentRepository.upsertIntent(String(order._id), user.id, {
            amount: 10,
            currency: 'EUR',
            provider: 'fake'
        });
        expect(payment!.providerRef).toBeUndefined();

        const retrieveSpy = jest.spyOn(fakePaymentProvider, 'retrieve');
        const result = await syncPayment(String(payment!._id), auth(user), testCallerContext);
        retrieveSpy.mockRestore();

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_NOT_CONFIRMABLE');
        expect(retrieveSpy).not.toHaveBeenCalled();
    });
});

/**
 * The provider's own callback — the authority for whether money moved. It reaches the same
 * settlement the browser-driven paths do, and it has no caller to answer, so what these pin is
 * the state it leaves behind.
 */
describe('applyWebhookSettlement', () => {
    it('pays the order on a succeeded delivery the browser never reported', async () => {
        // The tab was closed before the challenge finished. The webhook is what still pays it.
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const providerRef = String(
            (await paymentRepository.findByOrderId(String(order._id)))!.providerRef
        );

        await applyWebhookSettlement(providerRef, { status: 'succeeded', cardLast4: '4242' });

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
        expect(payment!.cardLast4).toBe('4242');
        const stored = await orderRepository.findById(String(order._id));
        expect(stored!.status).toBe('paid');
    });

    it('leaves a settled payment alone when the same outcome arrives again', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const providerRef = String(
            (await paymentRepository.findByOrderId(String(order._id)))!.providerRef
        );
        await applyWebhookSettlement(providerRef, { status: 'succeeded', cardLast4: '4242' });

        // A later `declined` for an intent that already succeeded must not un-pay the order —
        // the terminal states are outside `SETTLEABLE_PAYMENT_STATUSES` for exactly this.
        await applyWebhookSettlement(providerRef, { status: 'declined' });

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
    });

    it('does nothing for an intent this application does not know', async () => {
        await expect(
            applyWebhookSettlement('fake_pi_nobody', { status: 'succeeded' })
        ).resolves.toBeUndefined();
    });
});

/**
 * The ledger that makes a redelivery idempotent must not also make a FAILED delivery permanent —
 * the money bug this fix closes.
 */
describe('applyWebhookDelivery', () => {
    it('lets a delivery that failed to settle be redelivered, rather than swallowing it as a dupe', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const providerRef = String(
            (await paymentRepository.findByOrderId(String(order._id)))!.providerRef
        );
        const event = {
            id: 'evt_redelivery_test',
            providerRef,
            state: { status: 'succeeded' as const, cardLast4: '4242' }
        };

        // The settlement fails transiently on its first attempt — a DB blip, not a bad event.
        const updateSpy = jest
            .spyOn(paymentRepository, 'updateStatusIfIn')
            .mockRejectedValueOnce(new Error('transient failure'));

        await expect(applyWebhookDelivery(event)).rejects.toThrow('transient failure');
        updateSpy.mockRestore();

        // The provider's redelivery of the SAME event id is what settles it for real.
        await applyWebhookDelivery(event);

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
        expect((await orderRepository.findById(String(order._id)))!.status).toBe('paid');
    });
});

describe('refundByOrder', () => {
    it('returns the money and leaves the order where it is', async () => {
        // The whole point of the standalone action: a goodwill refund is not a cancellation.
        const { order } = await paidOrder();

        const result = await refundByOrder(String(order._id), asOwner(), testCallerContext);

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('refunded');
        const stored = await orderRepository.findById(String(order._id));
        expect(stored!.status).toBe('paid');
    });

    it('refuses the second attempt with 409 rather than paying twice', async () => {
        const { order } = await paidOrder();
        await refundByOrder(String(order._id), asOwner(), testCallerContext);

        const result = await refundByOrder(String(order._id), asOwner(), testCallerContext);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_NOT_REFUNDABLE');
    });

    it('refuses a payment that never succeeded with 409', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));

        const result = await refundByOrder(String(order._id), asOwner(), testCallerContext);

        expect(asReject(result).status).toBe(409);
    });

    it('answers 404 when the order never had a payment', async () => {
        const { order } = await orderFor();

        const result = await refundByOrder(String(order._id), asOwner(), testCallerContext);

        expect(asReject(result).status).toBe(404);
    });
});

describe('getForOrder — what the caller may do', () => {
    it('offers the operator a refund on money that arrived, once', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        await confirmPayment(
            String((intent as { data?: { id?: string } }).data?.id),
            GOOD_METHOD,
            auth(user),
            testCallerContext
        );

        const before = await getForOrder(String(order._id), asOwner());
        await refundByOrder(String(order._id), asOwner(), testCallerContext);
        const after = await getForOrder(String(order._id), asOwner());

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
            String((intent as { data?: { id?: string } }).data?.id),
            GOOD_METHOD,
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

        const result = await getForOrder(String(order._id), asOwner());

        expect((result as { data?: Record<string, unknown> }).data?.actions).toMatchObject({
            pay: false
        });
    });
});
