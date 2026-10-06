/**
 * @module
 * Payments service (`src/modules/payments/services/`) — pins the invariants: the intent freezes
 * the ORDER's total (shipping included), a confirm moves the order `pending → paid` conditionally
 * so the payment row only says `succeeded` when the order does, a decline is retryable, and a
 * refund (the `ORDER_REFUND_OWED` listener) is at-most-once. Real Mongo throughout, because the
 * guarantees are the conditional writes; the provider is the real `fake` one.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    readOrder,
    toOrderItem
} from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { userService } from '@modules/users';
import { inventoryService } from '@modules/inventory';
import {
    createIntent,
    confirmPayment,
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement,
    getForOrder,
    withActions,
    refundByOrder,
    recordOfflinePayment,
    retryPendingEffects
} from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { withEnvironment } from '@tests/environment';
import {
    FAKE_DECLINE_METHOD,
    fakePaymentProvider,
    setFakeOutcome
} from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asReject } from '@tests/response';
import { assignRole } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import {
    asCustomer,
    asAdmin,
    asModerator,
    asRole,
    testCallerContext,
    callerContextAs
} from '@tests/callers';

setupTestDb();

/** The reference the demo's own panel sends — an opaque handle, never a card number. */
const GOOD_METHOD = 'pm_card_visa';

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
        await forceOrderStatus(String(order._id), 'shipped');

        const result = await createIntent(String(order._id), auth(user));

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });

    it('writes `card` as the method — the vocabulary offline payments share the row with', async () => {
        const { user, order } = await orderFor();

        await createIntent(String(order._id), auth(user));

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.method).toBe('card');
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

    it('says `card` on an order checked out as bank transfer once the card pays it (JB8)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });
        const intent = await createIntent(String(order._id), auth(user));

        await confirmPayment(
            String(intent.success && intent.data?.id),
            GOOD_METHOD,
            auth(user),
            testCallerContext
        );

        expect((await orderService.getById(String(order._id)))!.paymentMethod).toBe('card');
    });

    it('keeps `bank_transfer` when the money was recorded by hand instead of a card', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });

        await recordOfflinePayment(
            String(order._id),
            { method: 'bank_transfer', reference: 'TRX-JB8' },
            callerContextAs('admin')
        );

        expect((await orderService.getById(String(order._id)))!.paymentMethod).toBe(
            'bank_transfer'
        );
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

    it('refuses to confirm once the order it was for is cancelled, before ever charging the card (A1)', async () => {
        // The order is cancelled in the window between opening the intent and confirming.
        // Charging the card and then refunding it would still work, but it loses the provider's
        // own fee on that refund — A1 refuses up front instead, before the provider is ever asked.
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String((intent as { data?: { id?: string } }).data?.id);
        await orderService.cancelById(String(order._id), auth(user));

        const confirmSpy = jest.spyOn(fakePaymentProvider, 'confirm');
        const refundSpy = jest.spyOn(fakePaymentProvider, 'refund');
        const result = await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
        // Neither the card nor a refund of it was ever reached — the whole point of refusing first.
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(refundSpy).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
        refundSpy.mockRestore();

        // Nothing moved: the payment sits exactly where the intent left it, not `refunded` — there
        // was never any money to give back.
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('requires_confirmation');
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

    /*
     * The bug this pins: `payments.any.update` is held by name, not through the scope wildcard
     * a moderator never holds — asking for the wildcard alone hid the refund action from them
     * despite the key they do hold, on a payment an operator has every reason to refund.
     */
    it('offers the refund action to a moderator, not just an admin', async () => {
        const { user, order } = await paidOrder();

        const asAdminResult = await getForOrder(String(order._id), asAdmin());
        const asModResult = await getForOrder(String(order._id), asModerator());
        const asSelfResult = await getForOrder(String(order._id), auth(user));

        expect(asAdminResult.data?.actions?.refund).toBe(true);
        expect(asModResult.data?.actions?.refund).toBe(true);
        expect(asSelfResult.data?.actions?.refund).toBe(false);
    });

    // A client renders its buttons from `actions`: a refund on an equal's or a superior's money
    // would be refused (OUTRANKED), so it must not be offered.
    it('offers the refund on a customer’s money and not once the buyer is a staff member', async () => {
        const { user, order } = await paidOrder();

        const whileCustomer = await getForOrder(String(order._id), asModerator());
        await assignRole(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'support');
        const whileStaff = await getForOrder(String(order._id), asModerator());

        expect([whileCustomer.data?.actions?.refund, whileStaff.data?.actions?.refund]).toEqual([
            true,
            false
        ]);
    });
});

// Nobody handles their own money: a buyer promoted to staff keeps their orders, and still
// cannot refund one — the refusal is a plain FORBIDDEN, and no refund is offered.
describe('a refund on one’s own order', () => {
    it('is refused, and not offered, to a buyer promoted to moderator', async () => {
        const { user, order } = await paidOrder();
        await assignRole(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'moderator');
        const own = asRole('moderator', user.id);

        const offered = await getForOrder(String(order._id), own);
        const refused = asReject(
            await refundByOrder(String(order._id), own, callerContextAs('moderator', user.id))
        );

        expect(offered.data?.actions?.refund).toBe(false);
        expect([refused.status, refused.errors[0].code]).toEqual([403, 'FORBIDDEN']);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
    });
});

/*
 * The refund rides the ORDER_REFUND_OWED event, and the subscription only exists once the
 * registry has run — a test that skipped `registerCheckoutModules` would assert the refund never
 * happens and pass for the wrong reason (same shape as the cart's erasure suite).
 */
describe('refund on cancel', () => {
    beforeEach(() => {
        registerCheckoutModules([paymentsModule]);
    });

    afterEach(() => {
        resetDomainEvents();
        jest.restoreAllMocks();
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

    it('erasing the account cancels its open intent at the provider and releases the hold', async () => {
        const { user, order } = await orderFor(25, 2);
        const [line] = order.items;
        await inventoryService.reserveForOrder(String(order._id), [
            { productId: String(line.product._id), quantity: 2 }
        ]);
        await createIntent(String(order._id), auth(user));
        const { providerRef } = (await paymentRepository.findByOrderId(String(order._id)))!;
        const cancelSpy = jest.spyOn(fakePaymentProvider, 'cancel');

        await userService.remove(user, true);

        expect(cancelSpy).toHaveBeenCalledWith(providerRef, expect.anything());
        expect(await countersOf(line.product._id)).toMatchObject({ reserved: 0 });
    });

    /*
     * The provider is asked FIRST, before the status moves: a rejection leaves the payment
     * `succeeded`, the one state the retry sweep can still act on, instead of a refund recorded
     * as done with the money never actually returned.
     */
    it('keeps a failed refund retryable instead of recording it as done', () =>
        withEnvironment('NODE_ORDER_EFFECT_RETRY_MINUTES', '0', async () => {
            const { user, order } = await orderFor();
            await createIntent(String(order._id), auth(user));
            const paymentId = String(
                (await paymentRepository.findByOrderId(String(order._id)))!._id
            );
            await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

            const refundSpy = jest
                .spyOn(fakePaymentProvider, 'refund')
                .mockRejectedValueOnce(new Error('payment provider unreachable'));

            await orderService.cancelById(String(order._id), auth(user));

            expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe(
                'succeeded'
            );

            expect(await orderService.retryPendingEffects()).toBe(1);
            expect(refundSpy).toHaveBeenCalledTimes(2);
            expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe(
                'refunded'
            );
            refundSpy.mockRestore();
        }));

    it('leaves an owed refund on an order lost mid-payment for the sweep to finish', () =>
        withEnvironment('NODE_ORDER_EFFECT_RETRY_MINUTES', '0', async () => {
            const { user, order } = await orderFor();
            const intent = await createIntent(String(order._id), auth(user));
            const paymentId = String((intent as { data?: { id?: string } }).data?.id);

            const refundSpy = jest
                .spyOn(fakePaymentProvider, 'refund')
                .mockRejectedValueOnce(new Error('payment provider unreachable'));
            // The order is cancelled DURING the provider round trip — after A1's own payable check
            // already read it as still pending, before `settlePayment`'s own re-read sees it gone.
            // That is settlement's own "order lost" branch, not a cancel's own refund (module
            // docblock rule 2), and A1 only closes the window BEFORE the provider is asked.
            const originalConfirm = fakePaymentProvider.confirm;
            const confirmSpy = jest
                .spyOn(fakePaymentProvider, 'confirm')
                .mockImplementationOnce(async (providerRef, methodRef) => {
                    await orderService.cancelById(String(order._id), auth(user));
                    return originalConfirm(providerRef, methodRef);
                });

            const result = await confirmPayment(
                paymentId,
                GOOD_METHOD,
                auth(user),
                testCallerContext
            );

            // settlePayment answers its own caller regardless — a rejected refund attempt is
            // logged, never rethrown.
            expect(asReject(result).status).toBe(409);
            expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe(
                'succeeded'
            );

            expect(await orderService.retryPendingEffects()).toBe(1);
            expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe(
                'refunded'
            );
            refundSpy.mockRestore();
            confirmSpy.mockRestore();
        }));

    /*
     * A refund must go to the PAYMENT's own provider, never whichever one `NODE_PAYMENT_PROVIDER`
     * names today — dormant while only `fake` is ever registered, live the day a deployment
     * switches providers with old payments still outstanding under the old one.
     */
    it('refuses to refund through a provider this payment was never made with', () => {
        const retiredProvider = 'retired-psp';
        return withEnvironment('NODE_ORDER_EFFECT_RETRY_MINUTES', '0', async () => {
            const { user, order } = await orderFor();
            await createIntent(String(order._id), auth(user));
            const paymentId = String(
                (await paymentRepository.findByOrderId(String(order._id)))!._id
            );
            await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);
            // Simulate a payment made under a provider this build no longer registers.
            await paymentRepository.updateStatusIfIn(
                String(order._id),
                ['succeeded'],
                'succeeded',
                {
                    provider: retiredProvider
                }
            );

            const refundSpy = jest.spyOn(fakePaymentProvider, 'refund');
            await orderService.cancelById(String(order._id), auth(user));

            expect(refundSpy).not.toHaveBeenCalled();
            expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe(
                'succeeded'
            );
            refundSpy.mockRestore();
        });
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
        setFakeOutcome(providerRef, { status: 'succeeded', cardLast4: '4242' });
        await applyWebhookSettlement(providerRef);

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('refunded');
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).not.toBe('paid');
    });

    /*
     * The interleaving a confirm and a customer cancel can produce: the confirm moves the order to
     * `paid`, the customer cancels it from `paid` at once, and that cancel's refund runs while the
     * payment still reads `requires_confirmation` — nothing to return yet. The confirm then writes
     * `succeeded`. Unless it re-reads the order, it trusts its own stale `paid` copy and keeps
     * money for an order that no longer exists. Forced here rather than hoped for under load.
     */
    it('returns a charge that lands after the customer cancelled the order it had just paid', async () => {
        const { user, order } = await orderFor();
        const orderId = String(order._id);
        const intent = await createIntent(orderId, auth(user));
        const realMarkPaid = orderService.markPaid;
        jest.spyOn(orderService, 'markPaid').mockImplementationOnce((id) =>
            realMarkPaid(id).then((paid) =>
                orderService.cancelById(id, auth(user)).then(() => paid)
            )
        );

        const result = await confirmPayment(
            String(intent.success && intent.data?.id),
            GOOD_METHOD,
            auth(user),
            testCallerContext
        );

        expect((await orderService.getById(orderId))!.status).toBe('cancelled');
        expect((await paymentRepository.findByOrderId(orderId))!.status).toBe('refunded');
        // The customer is told the order could not be paid, not that it was.
        expect(asReject(result).errors[0]).toMatchObject({ code: 'PAYMENT_ORDER_NOT_PAYABLE' });
    });
});

/** A real placed order: units held, nothing sold yet. */
const placedOrder = async (onHand = 10, quantity = 3, email?: string) => {
    const user = await createUser(email ? { email } : undefined);
    const product = await createProduct({ onHand });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity }],
        callerContextAs('admin')
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

/**
 * Committing the order's held stock — the other thing a confirm does. Lives here, not in
 * `cart/tests/integration/stock.test.ts`, because reaching `@modules/payments/services` from that suite
 * is what `eslint-plugin-boundaries` forbids. Orders are placed via `orderService.create` rather
 * than fixtures, so there is a real hold for the commit to claim.
 */
describe('the confirm commits the order’s held units', () => {
    it('drops both counters together when the money lands', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3, available: 7 });

        const paid = await payFor(String(order._id), user);

        expect(paid.success).toBe(true);
        // Availability is unchanged by the sale — those units stopped being sellable at checkout.
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
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
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3, available: 7 });
    });

    it('commits once even if the confirm is replayed', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        const intent = await createIntent(String(order._id), auth(user));
        const paymentId = String(intent.success && intent.data?.id);

        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);
        await confirmPayment(paymentId, GOOD_METHOD, auth(user), testCallerContext);

        // Seven, not four. Two guards refuse the replay independently — the order's conditional
        // `pending → paid` and the reservation's own `held → committed` claim.
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
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

        await applyWebhookSettlement(providerRef);
        await syncPayment(paymentId, auth(user), testCallerContext);

        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
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
        await applyWebhookSettlement(providerRef);

        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
    });
});

/**
 * Cancelling a PAID order only ever released a hold that payment had already turned into a
 * sale — `releaseForOrder` claims `held → released`, but a paid hold is `committed`, so it matched
 * nothing and the units were lost from the shelf for good. `restockForOrder` is what gives them
 * back once the release itself finds nothing to do.
 */
describe('cancelling a paid order restocks its units', () => {
    it('gives on-hand back, records a restock movement, and refuses a second cancel', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        await payFor(String(order._id), user);
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });

        const cancelled = await orderService.cancelById(String(order._id), auth(user));

        expect(cancelled.success).toBe(true);
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 0, available: 10 });
        const movements = await inventoryService.listMovements({ productId: String(product._id) });
        expect(movements.items.filter((row) => row.reason === 'restock')).toHaveLength(1);

        const second = await orderService.cancelById(String(order._id), auth(user));
        expect(second.success).toBe(false);
        expect(asReject(second).status).toBe(409);
    });

    it('rolls the status, the hold and the counters back together when the restock throws (D3)', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        await payFor(String(order._id), user);
        const restock = inventoryService.restockForOrder;
        // The real restock runs to completion, THEN throws — the worst case: counters already
        // moved inside the transaction, so only a rollback puts them back.
        jest.spyOn(inventoryService, 'restockForOrder').mockImplementationOnce(
            async (orderId, session) => {
                await restock(orderId, session);
                throw new Error('connection reset');
            }
        );

        await expect(orderService.cancelById(String(order._id), auth(user))).rejects.toThrow(
            'connection reset'
        );

        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe('paid');
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        const movements = await inventoryService.listMovements({ productId: String(product._id) });
        expect(movements.items.filter((row) => row.reason === 'restock')).toHaveLength(0);

        // Nothing was half-done, so the same cancel simply works when retried.
        const retried = await orderService.cancelById(String(order._id), auth(user));
        expect(retried.success).toBe(true);
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 0, available: 10 });
    });
});

/**
 * A crash between the `succeeded` write and the stock commit would otherwise lose the commit
 * forever — a redelivered webhook stops at the payment's own conditional write (already
 * `succeeded`, so a retry moves nothing) and never reaches the commit again. The `pendingEffects`
 * marker is what survives that crash, and `retryPendingEffects` is what acts on it.
 */
describe('B14 — a lost stock commit is retried, not lost', () => {
    it('marks the commit still owed when it throws, and leaves the hold untouched', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
            new Error('connection reset')
        );

        // The write to `succeeded` already landed by the time the commit throws — same as the
        // real crash this guards against, this call reports the failure to its own caller.
        await expect(payFor(String(order._id), user)).rejects.toThrow('connection reset');

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
        expect(payment!.pendingEffects).toEqual(['commit']);
        // Nothing committed: the mocked failure stood in for the commit itself, before any
        // counter moved.
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3, available: 7 });
    });

    it('finishes the commit and clears the marker on the next sweep', () =>
        withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            const { user, product, order } = await placedOrder(10, 3);
            jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
                new Error('connection reset')
            );
            await expect(payFor(String(order._id), user)).rejects.toThrow('connection reset');

            expect(await retryPendingEffects()).toBe(1);

            expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
            const payment = await paymentRepository.findByOrderId(String(order._id));
            // `[]`, not `undefined`: Mongoose defaults an array path back to empty once `$unset`
            // has removed it from storage — this is the cleared state, not a leftover value.
            expect(payment!.pendingEffects).toEqual([]);

            // A second pass finds nothing left to do — the marker is gone.
            expect(await retryPendingEffects()).toBe(0);
        }));

    it('drops the marker without committing when the order is no longer payable', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
            new Error('connection reset')
        );
        await expect(payFor(String(order._id), user)).rejects.toThrow('connection reset');
        await orderService.cancelById(String(order._id), auth(user));

        await withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            expect(await retryPendingEffects()).toBe(1);
        });

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.pendingEffects).toEqual([]);
        // Cancelling already released what a commit never took — the sweep must not commit a
        // sale for an order nobody can fulfil any more.
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 0, available: 10 });
    });

    it('marks the refund owed when the order moved on before settlement could react to it', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
            new Error('connection reset')
        );
        await expect(payFor(String(order._id), user)).rejects.toThrow('connection reset');
        // Simulates the crash itself: the order moved away from `paid` by some other means (a
        // race settlement's own `orderLost` branch never got to see, since the process died
        // first) — no cancel ran, so nothing wrote the order's own refund marker yet.
        await forceOrderStatus(String(order._id), 'cancelled');

        await withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            expect(await retryPendingEffects()).toBe(1);
        });

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
        expect(payment!.pendingEffects).toEqual([]);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.pendingEffects).toEqual(['refund']);
        // The commit never ran: the order can no longer use the stock it would have taken.
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3, available: 7 });
    });

    it('a commit that fails during the sweep itself keeps its marker, without losing the rest of the batch', () =>
        withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            const first = await placedOrder(10, 3);
            jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
                new Error('connection reset')
            );
            await expect(payFor(String(first.order._id), first.user)).rejects.toThrow(
                'connection reset'
            );

            const second = await placedOrder(10, 2, 'second-payment-effect@example.com');
            jest.spyOn(inventoryService, 'commitForOrder').mockRejectedValueOnce(
                new Error('connection reset')
            );
            await expect(payFor(String(second.order._id), second.user)).rejects.toThrow(
                'connection reset'
            );

            // Whichever of the two the sweep reaches first now throws inside `getById`, before it
            // ever decides whether stock is still owed. A bare `Promise.all` with no per-item
            // `.catch` around this call would reject wholesale, and NEITHER payment would be
            // reported swept — the bug this guards.
            jest.spyOn(orderService, 'getById').mockRejectedValueOnce(new Error('mongo blip'));

            // One settled — the failing one keeps its marker for the next pass instead of
            // silently losing the whole batch's count.
            expect(await retryPendingEffects()).toBe(1);

            const payments = await Promise.all([
                paymentRepository.findByOrderId(String(first.order._id)),
                paymentRepository.findByOrderId(String(second.order._id))
            ]);
            const cleared = payments.filter(
                (payment) => (payment!.pendingEffects ?? []).length === 0
            );
            const stillOwed = payments.filter(
                (payment) => (payment!.pendingEffects ?? []).length > 0
            );
            expect(cleared).toHaveLength(1);
            expect(stillOwed).toHaveLength(1);
        }));
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
        const stored = await orderService.getById(String(order._id));
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
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe('pending');
    });

    /*
     * A payment that goes `processing` can settle over days (a SEPA debit, some bank
     * redirects), so the ordinary 30-minute hold gets extended to the bank-transfer window —
     * otherwise the reservation sweep would cancel an order whose money is still on its way.
     * The TTL is zeroed so an un-extended hold is already stale by the time the sweep below runs.
     */
    it('extends the hold to the bank-transfer window once the payment goes processing', () =>
        withEnvironment('NODE_RESERVATION_TTL_MINUTES', '0', async () => {
            const { user, product, order } = await placedOrder(10, 3);
            const intent = await createIntent(String(order._id), auth(user));

            await confirmPayment(
                String(intent.success && intent.data?.id),
                'pm_card_processing',
                auth(user),
                testCallerContext
            );

            await inventoryService.runReservationSweep();

            // Still held, not swept: an un-extended hold would already have been stale.
            expect(await countersOf(product._id)).toEqual({
                onHand: 10,
                reserved: 3,
                available: 7
            });
            expect((await orderService.getById(String(order._id)))!.status).toBe('pending');
        }));

    // An expiry that released the hold before its cancellation landed leaves the order `pending`
    // and payable on paper, with nothing set aside for it: taking money then is the oversell the
    // hold exists to prevent.
    it('refuses a card confirm once the order has no hold, rather than charging for stock that may be gone', async () => {
        const { user, product, order } = await placedOrder(10, 3);
        const intent = await createIntent(String(order._id), auth(user));
        await inventoryService.releaseForOrder(String(order._id), 'expire');

        const result = await confirmPayment(
            String(intent.success && intent.data?.id),
            'pm_card_visa',
            auth(user),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(!result.success && result.errors[0]?.code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
        expect((await orderService.getById(String(order._id)))!.status).toBe('pending');
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 0, available: 10 });
    });

    it('does not extend the hold for a mere challenge — only processing does', () =>
        withEnvironment('NODE_RESERVATION_TTL_MINUTES', '0', async () => {
            const { user, product, order } = await placedOrder(10, 3);
            const intent = await createIntent(String(order._id), auth(user));

            await confirmPayment(
                String(intent.success && intent.data?.id),
                'pm_card_authentication_required',
                auth(user),
                testCallerContext
            );

            await inventoryService.runReservationSweep();

            // The zeroed TTL hold is stale immediately, and requires_action gets no grace — the
            // sweep releases it, same as any other abandoned checkout.
            expect(await countersOf(product._id)).toEqual({
                onHand: 10,
                reserved: 0,
                available: 10
            });
        }));

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

    it('withdraws the pay action once the order is already paid', async () => {
        // `isPayable` refuses the echo `system` may still write onto `paid` — this pins that the
        // withdrawal actually reaches the wire, not just the domain function in isolation.
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        await confirmPayment(
            String(intent.success && intent.data?.id),
            GOOD_METHOD,
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
        expect((await orderService.getById(String(order._id)))!.status).toBe('pending');
        expect(await countersOf(product._id)).toEqual({ onHand: 10, reserved: 3, available: 7 });
    });

    it('refuses to sync a row the provider was never asked to open', async () => {
        // Built straight off the repository, skipping createIntent — so there is no providerRef,
        // which is the one thing this branch exists to catch before it ever reaches the provider.
        const { user, order } = await orderFor();
        const upserted = await paymentRepository.upsertIntent(String(order._id), user.id, {
            amount: 10,
            currency: 'EUR',
            provider: 'fake'
        });
        const { payment } = upserted!;
        expect(payment.providerRef).toBeUndefined();

        const retrieveSpy = jest.spyOn(fakePaymentProvider, 'retrieve');
        const result = await syncPayment(String(payment._id), auth(user), testCallerContext);
        retrieveSpy.mockRestore();

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_NOT_CONFIRMABLE');
        expect(retrieveSpy).not.toHaveBeenCalled();
    });
});

/** One unconfirmed intent, and the provider reference its webhook would name. */
const unconfirmedIntent = async () => {
    const { user, order } = await orderFor();
    await createIntent(String(order._id), auth(user));
    const payment = await paymentRepository.findByOrderId(String(order._id));
    return { order, providerRef: String(payment!.providerRef) };
};

/**
 * The provider's own callback — the authority for whether money moved. It reaches the same
 * settlement the browser-driven paths do, and it has no caller to answer, so what these pin is
 * the state it leaves behind.
 */
describe('applyWebhookSettlement', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('pays the order when the provider says it succeeded, though the browser never reported it', async () => {
        // The tab was closed before the challenge finished. The webhook is what still pays it.
        const { order, providerRef } = await unconfirmedIntent();
        setFakeOutcome(providerRef, { status: 'succeeded', cardLast4: '4242' });

        await applyWebhookSettlement(providerRef);

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
        expect(payment!.cardLast4).toBe('4242');
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe('paid');
    });

    it('settles what the provider answers, not what a delivery might claim', async () => {
        // Nobody confirmed: the provider has no outcome for this intent, so it says `processing`,
        // which settles nothing. A body that claimed `succeeded` would have paid the order.
        const { order, providerRef } = await unconfirmedIntent();
        const retrieve = jest.spyOn(fakePaymentProvider, 'retrieve');

        await applyWebhookSettlement(providerRef);

        expect(retrieve).toHaveBeenCalledWith(providerRef);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('processing');
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe('pending');
    });

    it('leaves a settled payment alone, without asking the provider anything', async () => {
        const { order, providerRef } = await unconfirmedIntent();
        setFakeOutcome(providerRef, { status: 'succeeded', cardLast4: '4242' });
        await applyWebhookSettlement(providerRef);
        const retrieve = jest.spyOn(fakePaymentProvider, 'retrieve');

        // A later `declined` for an intent that already succeeded must not un-pay the order —
        // the terminal states are outside `SETTLEABLE_PAYMENT_STATUSES` for exactly this.
        setFakeOutcome(providerRef, { status: 'declined' });
        await applyWebhookSettlement(providerRef);

        expect(retrieve).not.toHaveBeenCalled();
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('succeeded');
    });

    it('does nothing for an intent this application does not know', async () => {
        const retrieve = jest.spyOn(fakePaymentProvider, 'retrieve');

        await expect(applyWebhookSettlement('fake_pi_nobody')).resolves.toBeUndefined();

        expect(retrieve).not.toHaveBeenCalled();
    });

    it('records a decline the provider reports', async () => {
        const { order, providerRef } = await unconfirmedIntent();
        setFakeOutcome(providerRef, { status: 'declined', cardLast4: '0002' });

        await applyWebhookSettlement(providerRef);

        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('declined');
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe('pending');
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
        setFakeOutcome(providerRef, { status: 'succeeded', cardLast4: '4242' });
        const event = { id: 'evt_redelivery_test', providerRef };

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
        expect((await orderService.getById(String(order._id)))!.status).toBe('paid');
    });
});

describe('refundByOrder', () => {
    it('returns the money and leaves the order where it is', async () => {
        // The whole point of the standalone action: a goodwill refund is not a cancellation.
        const { order } = await paidOrder();

        const result = await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment!.status).toBe('refunded');
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe('paid');
    });

    it('refuses the second attempt with 409 rather than paying twice', async () => {
        const { order } = await paidOrder();
        await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));

        const result = await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_NOT_REFUNDABLE');
    });

    it('refuses a payment that never succeeded with 409', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));

        const result = await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));

        expect(asReject(result).status).toBe(409);
    });

    it('answers 404 when the order never had a payment', async () => {
        const { order } = await orderFor();

        const result = await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));

        expect(asReject(result).status).toBe(404);
    });

    it('reaches the card provider — a card refund is not the manual short-circuit', async () => {
        const refundSpy = jest.spyOn(fakePaymentProvider, 'refund');
        const { order } = await paidOrder();

        await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));

        expect(refundSpy).toHaveBeenCalledTimes(1);
        refundSpy.mockRestore();
    });

    /*
     * The provider is asked first through THIS endpoint too, so a rejection leaves the payment
     * `succeeded` rather than answering 500 with the row already saying `refunded` — a retry here
     * really is a retry, not a 409 "already refunded" over money that never actually came back.
     */
    it('a rejected attempt leaves the payment succeeded, so a retry can still return the money', async () => {
        const { order } = await paidOrder();
        const refundSpy = jest
            .spyOn(fakePaymentProvider, 'refund')
            .mockRejectedValueOnce(new Error('payment provider unreachable'));

        await expect(
            refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'))
        ).rejects.toThrow('payment provider unreachable');
        expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe(
            'succeeded'
        );

        const retried = await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));

        expect(retried.success).toBe(true);
        expect((await paymentRepository.findByOrderId(String(order._id)))!.status).toBe('refunded');
        refundSpy.mockRestore();
    });
});

describe('recordOfflinePayment', () => {
    it('records the money and settles exactly like a card payment — order paid, stock committed', async () => {
        const { product, order } = await placedOrder(10, 3);

        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash', reference: 'till-42' },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment).toMatchObject({
            status: 'succeeded',
            provider: 'manual',
            method: 'cash',
            reference: 'till-42'
        });
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe('paid');
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
    });

    // Nobody handles their own money: an administrator who raised an order for themselves cannot
    // also record the cash for it.
    it('refuses the buyer recording cash on their own order, and leaves it pending', async () => {
        const { user, order } = await orderFor();
        await assignRole(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'admin');

        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash' },
            callerContextAs('admin', user.id)
        );

        expect([asReject(result).status, asReject(result).errors[0].code]).toEqual([
            403,
            'FORBIDDEN'
        ]);
        expect((await orderService.getById(String(order._id)))!.status).toBe('pending');
    });

    it('refuses an order that is not pending, the same code createIntent uses', async () => {
        const { order } = await orderFor();
        await forceOrderStatus(String(order._id), 'cancelled');

        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash' },
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });

    it('refuses a second recording once the order is already paid', async () => {
        const { order } = await orderFor();
        await recordOfflinePayment(String(order._id), { method: 'cash' }, callerContextAs('admin'));

        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash' },
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });

    it('refuses while a card charge is still reachable at the provider (B)', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        await confirmPayment(
            String(intent.success && intent.data?.id),
            'pm_card_authentication_required',
            auth(user),
            testCallerContext
        );
        const prepared = await paymentRepository.findByOrderId(String(order._id));

        const cancelSpy = jest.spyOn(fakePaymentProvider, 'cancel');
        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash' },
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_IN_FLIGHT');
        // The refusal comes from asking the PROVIDER, not a locally cached guess — the row stays
        // untouched rather than being silently overwritten out from under an open intent.
        expect(cancelSpy).toHaveBeenCalledWith(prepared!.providerRef, {
            reason: 'Recorded as an offline payment'
        });
        cancelSpy.mockRestore();
        // Never overwritten: the provider's refusal stopped the write before it happened.
        expect((await paymentRepository.findByOrderId(String(order._id)))!.provider).toBe('fake');
    });

    it('allows recording over a card attempt nobody completed — declined, or never confirmed', async () => {
        const { user, order } = await orderFor();
        const intent = await createIntent(String(order._id), auth(user));
        await confirmPayment(
            String(intent.success && intent.data?.id),
            FAKE_DECLINE_METHOD,
            auth(user),
            testCallerContext
        );

        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'bank_transfer', reference: 'TRX-1' },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment).toMatchObject({ status: 'succeeded', provider: 'manual' });
    });

    /**
     * An intent nobody ever confirmed must be closed at the provider before the money is recorded
     * by hand: otherwise an abandoned card could still resolve there later with no row left to
     * catch the charge. `cancel` closes it first.
     */
    it('cancels a never-confirmed intent at the provider before recording the money by hand', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const prepared = await paymentRepository.findByOrderId(String(order._id));
        expect(prepared!.status).toBe('requires_confirmation');

        const cancelSpy = jest.spyOn(fakePaymentProvider, 'cancel');
        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash', reference: 'till-1' },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        expect(cancelSpy).toHaveBeenCalledWith(prepared!.providerRef, {
            reason: 'Recorded as an offline payment'
        });
        cancelSpy.mockRestore();
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment).toMatchObject({ status: 'succeeded', provider: 'manual' });
    });

    it('never asks the provider anything when there was no existing payment to cancel', async () => {
        const { product, order } = await placedOrder(10, 3);

        const cancelSpy = jest.spyOn(fakePaymentProvider, 'cancel');
        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash', reference: 'till-2' },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        expect(cancelSpy).not.toHaveBeenCalled();
        cancelSpy.mockRestore();
        expect(await countersOf(product._id)).toEqual({ onHand: 7, reserved: 0, available: 7 });
    });

    it('refuses a `receivedAt` in the future', async () => {
        const { order } = await orderFor();

        const result = await recordOfflinePayment(
            String(order._id),
            { method: 'cash', receivedAt: new Date(Date.now() + 60_000).toISOString() },
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(422);
    });
});

describe('recordOfflinePayment — refunding it back', () => {
    beforeEach(() => {
        registerCheckoutModules([paymentsModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    /*
     * Only an operator confirming the cash came back may record `refundedByHand: true` — the
     * automatic cancel listener leaves a hand-paid order's payment `succeeded` instead, rather
     * than the system saying money moved that nobody actually moved.
     */
    it('leaves a cancelled offline payment succeeded, for an operator to confirm', async () => {
        const refundSpy = jest.spyOn(fakePaymentProvider, 'refund');
        const { user, order } = await orderFor();
        await recordOfflinePayment(String(order._id), { method: 'cash' }, callerContextAs('admin'));

        const cancelled = await orderService.cancelById(String(order._id), auth(user));

        expect(cancelled.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment).toMatchObject({ status: 'succeeded', refundedByHand: undefined });
        expect(refundSpy).not.toHaveBeenCalled();
        refundSpy.mockRestore();
    });

    it('only the admin refund endpoint can set refundedByHand, after that', async () => {
        const { user, order } = await orderFor();
        await recordOfflinePayment(String(order._id), { method: 'cash' }, callerContextAs('admin'));
        await orderService.cancelById(String(order._id), auth(user));

        const refunded = await refundByOrder(
            String(order._id),
            asAdmin(),
            callerContextAs('admin')
        );

        expect(refunded.success).toBe(true);
        const payment = await paymentRepository.findByOrderId(String(order._id));
        expect(payment).toMatchObject({ status: 'refunded', refundedByHand: true });
    });
});

describe('order.cancelled — closing a still-open intent at the provider', () => {
    beforeEach(() => {
        registerCheckoutModules([paymentsModule]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('cancels the open intent at the provider once its order is cancelled', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const prepared = await paymentRepository.findByOrderId(String(order._id));

        const cancelSpy = jest.spyOn(fakePaymentProvider, 'cancel');
        const cancelled = await orderService.cancelById(String(order._id), auth(user));

        expect(cancelled.success).toBe(true);
        // The listener runs off the outbox, after the cancel's own response.
        await settleOutboxNudges();
        expect(cancelSpy).toHaveBeenCalledWith(prepared!.providerRef, {
            reason: 'Order cancelled'
        });
        cancelSpy.mockRestore();
    });

    it('still cancels the order when the provider refuses or fails to close the intent', async () => {
        // Best-effort: unlike `recordOfflinePayment`'s own synchronous guard, the order is already
        // gone by the time this listener runs — there is no request left here to refuse.
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));

        const cancelSpy = jest
            .spyOn(fakePaymentProvider, 'cancel')
            .mockRejectedValueOnce(new Error('provider unreachable'));
        const cancelled = await orderService.cancelById(String(order._id), auth(user));

        expect(cancelled.success).toBe(true);
        // The listener runs off the outbox, after the cancel's own response.
        await settleOutboxNudges();
        expect(cancelSpy).toHaveBeenCalled();
        cancelSpy.mockRestore();
        await expect(
            orderService.getById(String(order._id)).then((stored) => stored!.status)
        ).resolves.toBe('cancelled');
    });

    it('does not ask the provider anything for a payment that already succeeded', async () => {
        // `succeeded` is `order.refund_owed`'s to give back, not this listener's to cancel.
        const { user, order } = await orderFor();
        await payFor(String(order._id), user);

        const cancelSpy = jest.spyOn(fakePaymentProvider, 'cancel');
        const cancelled = await orderService.cancelById(String(order._id), auth(user));

        expect(cancelled.success).toBe(true);
        // The listener runs off the outbox, after the cancel's own response.
        await settleOutboxNudges();
        expect(cancelSpy).not.toHaveBeenCalled();
        cancelSpy.mockRestore();
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

        const before = await getForOrder(String(order._id), asAdmin());
        await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));
        const after = await getForOrder(String(order._id), asAdmin());

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

        // Read as the payer: any other reader is refused `pay` for the caller's half alone.
        const result = await getForOrder(String(order._id), auth(user));

        expect((result as { data?: Record<string, unknown> }).data?.actions).toMatchObject({
            pay: false
        });
    });

    // The caller's half of `pay`, the same two questions `Order.actions.pay` asks: the payer, and
    // an account that shops.
    it('offers `pay` to the payer and withholds it from staff reading the same payment', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));

        const asPayer = await getForOrder(String(order._id), auth(user));
        const asStaff = await getForOrder(String(order._id), asModerator());

        expect([asPayer.data?.actions?.pay, asStaff.data?.actions?.pay]).toEqual([true, false]);
    });

    it('withholds `pay` from a customer who is not the payer, key or no key', async () => {
        const { user, order } = await orderFor();
        await createIntent(String(order._id), auth(user));
        const payment = await paymentRepository.findByOrderId(String(order._id));
        const stranger = await createUser({ email: 'not-the-payer@example.com' });

        const body = await withActions(payment!, order, auth(stranger));

        expect(body.actions?.pay).toBe(false);
    });
});
