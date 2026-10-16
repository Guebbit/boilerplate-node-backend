/**
 * @module
 * Cancelling what has not shipped: a Return of `kind: cancellation`, closed when made — against a
 * real database and the real `fake` payment provider. What is worth pinning: the lines, the stock,
 * the order's summary and the Return row commit together; the money is the cancelled lines plus the
 * delivery only on the cancel (or return) that takes the LAST unit, and never twice; the buyer's
 * door and staff's (under the refund key) differ in who may use them; and what `GET /returns/options`
 * quotes is what the cancel then refunds.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { withEnvironmentOverrides } from '@tests/environment';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import {
    asAdmin,
    asCustomer,
    asModerator,
    asRole,
    asWarehouse,
    callerContextAs,
    testCallerContext
} from '@tests/callers';
import { asReject } from '@tests/response';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { accessService } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    readOrder,
    setWithdrawUntil,
    timelineOf,
    toOrderItem
} from '@modules/orders/tests/factories';
import { withdrawUntilFrom } from '@modules/orders';
import {
    deliverEverything,
    fulfillmentOrdersOf,
    shipmentsOf
} from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery';
import { OrderStatus } from '@types';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A distinct address per customer. */
let customers = 0;

/**
 * Two shirts (30.00) and a mug (10.00) with 5.00 of delivery on top — 75.00, paid by card, the
 * units held and sold for real — and only the shirts shipped. The mug is the remainder.
 */
const partlyShipped = async (mugOverrides: Parameters<typeof createProduct>[0] = {}) => {
    customers += 1;
    const user = await createUser({ email: `cancel-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: 10, onHand: 10, ...mugOverrides });
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)], {
        shippingMethod: 'standard',
        shippingCost: 5
    });
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    await forceOrderStatus(orderId, OrderStatus.processing);
    const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
    const shipped = await deliveryService.shipFulfillmentOrder(
        String(fulfillmentOrder._id),
        { lines: [{ productId: String(shirt._id), quantity: 2 }] },
        asAdmin(),
        callerContextAs('admin')
    );
    if (!shipped.success) throw new Error('ship refused');
    return {
        user,
        shirt,
        mug,
        orderId,
        fulfillmentOrderId: String(fulfillmentOrder._id)
    };
};

type Fixture = Awaited<ReturnType<typeof partlyShipped>>;

/** The buyer's own request to cancel what has not shipped. */
const buyerCancels = (fixture: Fixture) =>
    returnService.createReturn(
        {
            orderId: fixture.orderId,
            reason: 'withdrawal',
            kind: 'cancellation',
            fulfillmentOrderId: fixture.fulfillmentOrderId
        },
        asCustomer(fixture.user.id),
        testCallerContext
    );

/** A created cancellation, or a loud failure. */
const created = (outcome: Awaited<ReturnType<typeof returnService.createReturn>>) => {
    if (!outcome.success)
        throw new Error(`expected a cancellation: ${JSON.stringify(outcome.errors)}`);
    return outcome.data;
};

/** Withdraw from everything that shipped and take the goods back, as staff would. */
const returnShippedGoods = async (
    fixture: Fixture,
    reason: 'withdrawal' | 'defective' = 'withdrawal'
) => {
    const outcome = await returnService.createReturn(
        { orderId: fixture.orderId, reason },
        asCustomer(fixture.user.id),
        testCallerContext
    );
    const opened = created(outcome);
    if (reason !== 'withdrawal')
        await returnService.approveReturn(String(opened._id), callerContextAs('admin'));
    const received = await returnService.receiveReturn(
        String(opened._id),
        {},
        callerContextAs('admin')
    );
    if (!received.success) throw new Error('receipt refused');
    return received.data;
};

/** What the payment has refunded so far, and each refund's reason and amount. */
const refundsOf = async (orderId: string) => {
    const result = await paymentService.getForOrder(orderId, asAdmin());
    if (!result.success) throw new Error('no payment');
    return result.data.refunds.map(({ reason, amount }) => ({ reason, amount }));
};

describe('the buyer cancelling what has not shipped', () => {
    it('writes a closed cancellation of the remainder, refunds its lines, and gives the units back', async () => {
        const fixture = await partlyShipped();

        const cancellation = created(await buyerCancels(fixture));

        expect(cancellation).toMatchObject({ status: 'closed', kind: 'cancellation' });
        expect(String(cancellation.fulfillmentOrderId)).toBe(fixture.fulfillmentOrderId);
        expect(
            cancellation.lines.map(({ productId, quantity }) => [String(productId), quantity])
        ).toEqual([[String(fixture.mug._id), 1]]);
        expect(cancellation.refundAmount).toBe(10);
        expect(await refundsOf(fixture.orderId)).toEqual([{ reason: 'cancellation', amount: 10 }]);
        // The mug goes back on sale; the shirts that left stay out of the shelf's count.
        expect(await countersOf(fixture.mug._id)).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
        expect(await countersOf(fixture.shirt._id)).toEqual({
            onHand: 8,
            reserved: 0,
            available: 8
        });
    });

    it('closes the fulfillment order, reports nothing left, and moves the order to shipped while a shipment is out', async () => {
        const fixture = await partlyShipped();

        await buyerCancels(fixture);

        const [fulfillmentOrder] = await fulfillmentOrdersOf(fixture.orderId);
        expect(fulfillmentOrder.status).toBe('closed');
        expect(
            fulfillmentOrder.lines.find(({ productId }) => productId === String(fixture.mug._id))
        ).toMatchObject({
            cancelledQuantity: 1,
            shippedQuantity: 0
        });
        const stored = await readOrder(fixture.orderId);
        expect(stored?.status).toBe(OrderStatus.shipped);
        expect(stored?.fulfillment).toMatchObject({ remaining: 0, undelivered: 1 });
    });

    it('makes the order shipped AND delivered in one go when every shipment had already arrived, counting the window from the cancel', async () => {
        const fixture = await partlyShipped();
        await deliverEverything(fixture.orderId);
        const before = new Date();

        const cancellation = created(await buyerCancels(fixture));

        const stored = await readOrder(fixture.orderId);
        expect(stored?.status).toBe(OrderStatus.delivered);
        expect(stored?.withdrawUntil?.getTime()).toBeGreaterThanOrEqual(
            withdrawUntilFrom(before, 30).getTime()
        );
        expect(cancellation.closedAt).toBeInstanceOf(Date);
    });

    it('is refused when the reason is not a withdrawal, when it names lines, and when it names no fulfillment order', async () => {
        const fixture = await partlyShipped();
        const buyer = asCustomer(fixture.user.id);
        const base = {
            orderId: fixture.orderId,
            kind: 'cancellation' as const,
            fulfillmentOrderId: fixture.fulfillmentOrderId
        };

        const defective = await returnService.createReturn(
            { ...base, reason: 'defective' },
            buyer,
            testCallerContext
        );
        const withLines = await returnService.createReturn(
            {
                ...base,
                reason: 'withdrawal',
                lines: [{ productId: String(fixture.mug._id), quantity: 1 }]
            },
            buyer,
            testCallerContext
        );
        const none = await returnService.createReturn(
            { orderId: fixture.orderId, reason: 'withdrawal', kind: 'cancellation' },
            buyer,
            testCallerContext
        );
        const goodsReturnNamingOne = await returnService.createReturn(
            {
                orderId: fixture.orderId,
                reason: 'withdrawal',
                fulfillmentOrderId: fixture.fulfillmentOrderId
            },
            buyer,
            testCallerContext
        );

        for (const outcome of [defective, withLines, none, goodsReturnNamingOne]) {
            expect(outcome.success).toBe(false);
            expect(!outcome.success && outcome.errors[0].code).toBe('RETURN_CANCELLATION_INVALID');
        }
        expect(await returnRepository.findByOrderId(fixture.orderId)).toEqual([]);
    });

    it('answers 409 when nothing has shipped yet — that order is cancelled whole instead', async () => {
        customers += 1;
        const user = await createUser({ email: `cancel-${customers}@example.com` });
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const outcome = await returnService.createReturn(
            {
                orderId: String(order._id),
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: String(fulfillmentOrder._id)
            },
            asCustomer(user.id),
            testCallerContext
        );

        expect(!outcome.success && outcome.errors[0].code).toBe('RETURN_NOTHING_TO_CANCEL');
    });

    it('answers 409 the second time: there is no remainder left to cancel', async () => {
        const fixture = await partlyShipped();
        await buyerCancels(fixture);

        const again = await buyerCancels(fixture);

        expect(!again.success && again.errors[0].code).toBe('RETURN_NOTHING_TO_CANCEL');
        expect(await refundsOf(fixture.orderId)).toHaveLength(1);
    });

    it('answers 409 once the withdrawal window has closed, and writes nothing', async () => {
        const fixture = await partlyShipped();
        await setWithdrawUntil(fixture.orderId, new Date(Date.now() - 1000));

        const outcome = await buyerCancels(fixture);

        expect(!outcome.success && outcome.errors[0].code).toBe('RETURN_WINDOW_CLOSED');
        expect(await returnRepository.findByOrderId(fixture.orderId)).toEqual([]);
    });

    it('lets exactly one of two parallel cancels through', async () => {
        const fixture = await partlyShipped();

        const outcomes = await Promise.all([buyerCancels(fixture), buyerCancels(fixture)]);

        expect(outcomes.filter(({ success }) => success)).toHaveLength(1);
        expect(await refundsOf(fixture.orderId)).toHaveLength(1);
        expect(await countersOf(fixture.mug._id)).toMatchObject({ reserved: 0 });
    });

    it('is not another buyer’s to make', async () => {
        const fixture = await partlyShipped();
        const stranger = await createUser({ email: 'stranger-cancel@example.com' });

        const outcome = await returnService.createReturn(
            {
                orderId: fixture.orderId,
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: fixture.fulfillmentOrderId
            },
            asCustomer(stranger.id),
            testCallerContext
        );

        // Scoped to what the caller may read: a stranger is told the order does not exist.
        expect(asReject(outcome).status).toBe(404);
        expect(await refundsOf(fixture.orderId)).toEqual([]);
    });

    it('refuses goods Art. 16 excludes — an engraved mug that has not shipped is the shop’s to keep', async () => {
        const fixture = await partlyShipped({ noWithdrawal: true });

        const outcome = await buyerCancels(fixture);

        expect(!outcome.success && outcome.errors[0].code).toBe('RETURN_LINES_INVALID');
        expect(await refundsOf(fixture.orderId)).toEqual([]);
        expect(await returnRepository.findByOrderId(fixture.orderId)).toEqual([]);
        expect(await countersOf(fixture.mug._id)).toMatchObject({ reserved: 1 });
    });

    it('rolls the lines, the units and the Return back together when the write fails', async () => {
        const fixture = await partlyShipped();
        jest.spyOn(returnRepository, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(buyerCancels(fixture)).rejects.toThrow('disk full');

        const [fulfillmentOrder] = await fulfillmentOrdersOf(fixture.orderId);
        expect(fulfillmentOrder.status).toBe('in_progress');
        expect(await countersOf(fixture.mug._id)).toMatchObject({ reserved: 1 });
        expect(await returnRepository.findByOrderId(fixture.orderId)).toEqual([]);
        expect(await refundsOf(fixture.orderId)).toEqual([]);
    });
});

/** A staff request to cancel the remainder, with the caller's role. */
const staffCancels = (fixture: Fixture, role: 'moderator' | 'warehouse') =>
    returnService.createReturn(
        {
            orderId: fixture.orderId,
            reason: 'other',
            kind: 'cancellation',
            fulfillmentOrderId: fixture.fulfillmentOrderId
        },
        role === 'moderator' ? asModerator() : asWarehouse(),
        callerContextAs(role)
    );

describe('the order timeline of a cancelled remainder', () => {
    it('says the remainder was cancelled, and leaves the return rows to the returns it is not', async () => {
        const fixture = await partlyShipped();

        created(await buyerCancels(fixture));

        const rows = await timelineOf(fixture.orderId);
        expect(rows.map(({ type }) => type)).toContain('remainder_cancelled');
        expect(rows.find(({ type }) => type === 'remainder_cancelled')?.data).toEqual({
            fulfillmentOrderId: fixture.fulfillmentOrderId
        });
        expect(rows.map(({ type }) => type)).not.toContain('return_requested');
    });
});

describe('staff cancelling what has not shipped', () => {
    it('needs the refund key — a moderator holds it', async () => {
        const fixture = await partlyShipped();

        const cancellation = created(await staffCancels(fixture, 'moderator'));

        expect(cancellation).toMatchObject({
            kind: 'cancellation',
            status: 'closed',
            refundAmount: 10
        });
        expect(await refundsOf(fixture.orderId)).toEqual([{ reason: 'cancellation', amount: 10 }]);
    });

    it('is refused to a caller without it — the warehouse may receive goods, not decide a refund', async () => {
        const fixture = await partlyShipped();
        const audited: AuditEntry[] = [];
        registerAuditSink((entry) => audited.push(entry));

        const outcome = await staffCancels(fixture, 'warehouse');

        expect(!outcome.success && outcome.status).toBe(403);
        expect(audited).toEqual([
            expect.objectContaining({
                action: 'security.forbidden',
                outcome: 'failure',
                targetType: 'order',
                targetId: fixture.orderId,
                metadata: { reason: 'missing_permission', permission: 'create:Refund' }
            })
        ]);
        expect(await refundsOf(fixture.orderId)).toEqual([]);
        expect(await fulfillmentOrdersOf(fixture.orderId).then(([first]) => first.status)).toBe(
            'in_progress'
        );
    });

    // The reason is the buyer's own right: written by staff on someone else's order it would falsify
    // a legal record, so the request is refused whatever the staff member could otherwise do.
    it('refuses staff naming withdrawal on a stranger’s order, and writes nothing', async () => {
        const fixture = await partlyShipped();

        const outcome = await returnService.createReturn(
            {
                orderId: fixture.orderId,
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: fixture.fulfillmentOrderId
            },
            asModerator(),
            callerContextAs('moderator')
        );

        expect(asReject(outcome)).toMatchObject({ status: 422 });
        expect(asReject(outcome).errors[0].code).toBe('RETURN_CANCELLATION_INVALID');
        expect(await fulfillmentOrdersOf(fixture.orderId).then(([first]) => first.status)).toBe(
            'in_progress'
        );
        expect(await returnRepository.findByOrderId(fixture.orderId)).toEqual([]);
        expect(await refundsOf(fixture.orderId)).toEqual([]);
    });

    it('asks the key before the reason: a warehouse naming withdrawal is told 403, not 422', async () => {
        const fixture = await partlyShipped();

        const outcome = await returnService.createReturn(
            {
                orderId: fixture.orderId,
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: fixture.fulfillmentOrderId
            },
            asWarehouse(),
            callerContextAs('warehouse')
        );

        expect(asReject(outcome).status).toBe(403);
    });

    it('answers a staff member’s own order as its buyer: withdrawal works, any other reason is refused', async () => {
        const fixture = await partlyShipped();
        const asBuyingModerator = asRole('moderator', fixture.user.id);
        const base = {
            orderId: fixture.orderId,
            kind: 'cancellation' as const,
            fulfillmentOrderId: fixture.fulfillmentOrderId
        };

        const other = await returnService.createReturn(
            { ...base, reason: 'other' },
            asBuyingModerator,
            callerContextAs('moderator')
        );
        const withdrawal = await returnService.createReturn(
            { ...base, reason: 'withdrawal' },
            asBuyingModerator,
            callerContextAs('moderator')
        );

        expect(asReject(other).errors[0].code).toBe('RETURN_CANCELLATION_INVALID');
        expect(created(withdrawal)).toMatchObject({ reason: 'withdrawal', status: 'closed' });
        expect(
            await fulfillmentOrdersOf(fixture.orderId).then(([first]) => first.cancelReason)
        ).toBe('buyer');
    });

    it('answers a stranger’s order 404 to staff who cannot read orders, not 409 or 403', async () => {
        const fixture = await partlyShipped();

        const outcome = await returnService.createReturn(
            {
                orderId: fixture.orderId,
                reason: 'other',
                kind: 'cancellation',
                fulfillmentOrderId: fixture.fulfillmentOrderId
            },
            asRole('customer', 'someone-else'),
            testCallerContext
        );

        expect(asReject(outcome).status).toBe(404);
    });

    it('is allowed on an administrator’s order too: nothing ranks, the refund key is the whole rule', async () => {
        const fixture = await partlyShipped();
        await accessService.assignRole(fixture.user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'admin');

        const cancellation = created(await staffCancels(fixture, 'moderator'));

        expect(cancellation).toMatchObject({ kind: 'cancellation', status: 'closed' });
        expect(await refundsOf(fixture.orderId)).toEqual([{ reason: 'cancellation', amount: 10 }]);
    });
});

describe('the delivery, across several cancels and returns', () => {
    it('is refunded by the cancel that takes the last unit, all of it — after the goods came back', async () => {
        const fixture = await partlyShipped();
        const returned = await returnShippedGoods(fixture);
        // The shirts are back but the mug is still out of reach of the count: no delivery yet.
        expect(returned.refundAmount).toBe(60);

        const cancellation = created(await buyerCancels(fixture));

        // 10.00 of mug and all 5.00 of delivery: nothing was delivered for the cancelled unit.
        expect(cancellation.refundAmount).toBe(15);
        expect(
            await refundsOf(fixture.orderId).then((all) => all.map(({ amount }) => amount))
        ).toEqual([60, 15]);
    });

    it('is refunded by the return that takes the last unit, by that return’s own rule — after the cancel', async () => {
        const fixture = await partlyShipped();
        const cancellation = created(await buyerCancels(fixture));
        expect(cancellation.refundAmount).toBe(10);

        const returned = await returnShippedGoods(fixture);

        // A withdrawal gets back the delivery paid up to the cheapest standard delivery: 5.00.
        expect(returned.refundAmount).toBe(65);
        expect(
            await refundsOf(fixture.orderId).then((all) => all.map(({ amount }) => amount))
        ).toEqual([10, 65]);
    });

    it('is refunded once, however the last two are ordered: the payment ends exactly refunded', async () => {
        const fixture = await partlyShipped();
        await buyerCancels(fixture);
        await returnShippedGoods(fixture, 'defective');

        const refunds = await refundsOf(fixture.orderId);
        const result = await paymentService.getForOrder(fixture.orderId, asAdmin());

        // Faulty goods: the delivery goes back whole, 5.00 — once, on the return that closed the order.
        expect(refunds.map(({ amount }) => amount)).toEqual([10, 65]);
        expect(result.success && result.data.status).toBe('succeeded');
    });

    it('reads the order as returned once what could come back has, a cancel taking the rest out of the count', async () => {
        const fixture = await partlyShipped();
        await buyerCancels(fixture);

        await returnShippedGoods(fixture);

        const stored = await readOrder(fixture.orderId);
        expect(stored?.returnStatus).toBe('returned');
    });
});

describe('a cancellation whose refund the provider refuses', () => {
    it('stays closed, leaves the refund failed, and the payment sweep completes it', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_EFFECT_RETRY_MINUTES: '0' }, async () => {
            const fixture = await partlyShipped();
            jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));

            const cancellation = created(await buyerCancels(fixture));

            expect(cancellation.status).toBe('closed');
            const before = await paymentService.getForOrder(fixture.orderId, asAdmin());
            expect(before.success && before.data.refunds[0]).toMatchObject({
                status: 'failed',
                reason: 'cancellation',
                returnId: String(cancellation._id)
            });

            await paymentService.retryOpenRefunds();

            const after = await paymentService.getForOrder(fixture.orderId, asAdmin());
            expect(after.success && after.data.refunds[0].status).toBe('succeeded');
            expect(
                await returnRepository.findById(String(cancellation._id)).then((one) => one?.status)
            ).toBe('closed');
        }));
});

describe('GET /returns/options', () => {
    it('quotes what is returnable and what a cancel would refund — and that is what the cancel then refunds', async () => {
        const fixture = await partlyShipped();
        const buyer = asCustomer(fixture.user.id);

        const options = await returnService.getReturnOptions(fixture.orderId, buyer);

        expect(options.success && options.data).toMatchObject({
            orderId: fixture.orderId,
            currency: 'EUR',
            returnable: [{ productId: String(fixture.shirt._id), title: 'Shirt', quantity: 2 }],
            cancellable: [
                {
                    fulfillmentOrderId: fixture.fulfillmentOrderId,
                    number: 1,
                    lines: [{ productId: String(fixture.mug._id), title: 'Mug', quantity: 1 }],
                    refundAmount: 10,
                    shippingRefund: 0
                }
            ]
        });
        const quoted = options.success ? options.data.cancellable[0].refundAmount : -1;
        const cancellation = created(await buyerCancels(fixture));
        expect(cancellation.refundAmount).toBe(quoted);
    });

    it('adds the delivery to the quote once the goods have come back, and offers nothing left to return', async () => {
        const fixture = await partlyShipped();
        await returnShippedGoods(fixture);

        const options = await returnService.getReturnOptions(
            fixture.orderId,
            asCustomer(fixture.user.id)
        );

        expect(options.success && options.data.returnable).toEqual([]);
        expect(options.success && options.data.cancellable[0]).toMatchObject({
            refundAmount: 15,
            shippingRefund: 5
        });
    });

    it('offers nothing to cancel while nothing has shipped, nothing to return, and nothing at all to a stranger', async () => {
        customers += 1;
        const user = await createUser({ email: `cancel-${customers}@example.com` });
        const stranger = await createUser({ email: 'stranger-options@example.com' });
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        await fulfillmentOrdersOf(String(order._id));

        const own = await returnService.getReturnOptions(String(order._id), asCustomer(user.id));
        const other = await returnService.getReturnOptions(
            String(order._id),
            asCustomer(stranger.id)
        );

        expect(own.success && own.data).toMatchObject({ returnable: [], cancellable: [] });
        expect(asReject(other).status).toBe(404);
    });

    // `cancel` is the door's own rule, asked for this caller: the button never offers a refusal.
    it('says per caller whether the cancel is theirs: the buyer, staff with the key, and not staff without it', async () => {
        const fixture = await partlyShipped();
        const cancelFor = async (caller: Parameters<typeof returnService.getReturnOptions>[1]) => {
            const options = await returnService.getReturnOptions(fixture.orderId, caller);
            return options.success ? options.data.cancellable.map(({ cancel }) => cancel) : [];
        };

        expect(await cancelFor(asCustomer(fixture.user.id))).toEqual([true]);
        expect(await cancelFor(asModerator())).toEqual([true]);
        expect(await cancelFor(asWarehouse())).toEqual([false]);
    });

    it('says the buyer may not cancel once the window has closed, or when the goods are excluded', async () => {
        const closed = await partlyShipped();
        await setWithdrawUntil(closed.orderId, new Date(Date.now() - 1000));
        const excluded = await partlyShipped({ noWithdrawal: true });

        const afterWindow = await returnService.getReturnOptions(
            closed.orderId,
            asCustomer(closed.user.id)
        );
        const engraved = await returnService.getReturnOptions(
            excluded.orderId,
            asCustomer(excluded.user.id)
        );

        expect(afterWindow.success && afterWindow.data.cancellable[0].cancel).toBe(false);
        expect(engraved.success && engraved.data.cancellable[0].cancel).toBe(false);
    });

    it('lets staff who read returns see any order’s', async () => {
        const fixture = await partlyShipped();

        const options = await returnService.getReturnOptions(fixture.orderId, asAdmin());

        expect(options.success && options.data.cancellable).toHaveLength(1);
    });
});

describe('returning goods that shipped in part', () => {
    it('lets a return take only as many units as have shipped, and no more', async () => {
        customers += 1;
        const user = await createUser({ email: `cancel-${customers}@example.com` });
        const shirt = await createProduct({ title: 'Shirt', price: 30 });
        const order = await createOrder(user, [toOrderItem(shirt, 2)], {
            status: OrderStatus.processing
        });
        const orderId = String(order._id);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
        await deliveryService.shipFulfillmentOrder(
            String(fulfillmentOrder._id),
            { lines: [{ productId: String(shirt._id), quantity: 1 }] },
            asAdmin(),
            callerContextAs('admin')
        );
        const buyer = asCustomer(user.id);

        const tooMany = await returnService.createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(shirt._id), quantity: 2 }]
            },
            buyer,
            testCallerContext
        );
        const one = await returnService.createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(shirt._id), quantity: 1 }]
            },
            buyer,
            testCallerContext
        );
        const again = await returnService.createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(shirt._id), quantity: 1 }]
            },
            buyer,
            testCallerContext
        );

        expect(!tooMany.success && tooMany.errors[0].code).toBe('RETURN_LINES_INVALID');
        expect(one.success).toBe(true);
        expect(!again.success && again.errors[0].code).toBe('RETURN_LINES_INVALID');
        expect(await shipmentsOf(orderId)).toHaveLength(1);
    });

    it('turns a withdrawal that loses a race against a shipment into a return, never a full refund', async () => {
        customers += 1;
        const user = await createUser({ email: `cancel-${customers}@example.com` });
        const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
        const order = await createOrder(user, [toOrderItem(shirt, 1)], {
            status: OrderStatus.processing
        });
        const orderId = String(order._id);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);

        const [shipped, withdrawn] = await Promise.all([
            deliveryService.shipFulfillmentOrder(
                String(fulfillmentOrder._id),
                {},
                asAdmin(),
                callerContextAs('admin')
            ),
            returnService.createReturn(
                { orderId, reason: 'withdrawal' },
                asCustomer(user.id),
                testCallerContext
            )
        ]);

        const stored = await readOrder(orderId);
        const returns = await returnRepository.findByOrderId(orderId);
        if (shipped.success) {
            // The shipment won: the order is not cancelled, and the withdrawal is a return of what left.
            expect(stored?.status).toBe(OrderStatus.shipped);
            expect(withdrawn.success).toBe(true);
            expect(returns).toHaveLength(1);
            expect(returns[0]).toMatchObject({ kind: 'return', status: 'approved' });
            expect(returns[0].lines).toHaveLength(1);
        } else {
            // The cancel won: nothing shipped, and the shipment was refused.
            expect(stored?.status).toBe(OrderStatus.cancelled);
            expect(await shipmentsOf(orderId)).toEqual([]);
        }
    });
});

/**
 * A paid, partly shipped order: a shirt in stock (shipped) and a preorder product whose paid
 * fulfillment order waits `on_hold` for stock. The preorder is the remainder. With
 * `shipShirt: false` nothing ships: the shirt's fulfillment order stays open beside the waiting one.
 */
const shirtShippedPreorderWaiting = async ({ shipShirt = true } = {}) => {
    customers += 1;
    const user = await createUser({ email: `preorder-cancel-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const game = await createProduct({
        title: 'Game',
        price: 10,
        onHand: 0,
        releaseDate: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    const gameId = String(game._id);
    await inventoryService.setPreorderLimit(gameId, 5);
    const order = await createOrder(user, [toOrderItem(shirt, 1), toOrderItem(game, 2)], {
        shippingMethod: 'standard',
        shippingCost: 5
    });
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 1 },
        { productId: gameId, quantity: 2, kind: 'preorder' }
    ]);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    await forceOrderStatus(orderId, OrderStatus.processing);
    const all = await fulfillmentOrdersOf(orderId);
    const ordinary = all.find(({ status }) => status === 'open');
    const waiting = all.find(({ status }) => status === 'on_hold');
    if (!ordinary || !waiting) throw new Error('the order did not split');
    if (shipShirt) {
        const shipped = await deliveryService.shipFulfillmentOrder(
            String(ordinary._id),
            {},
            asAdmin(),
            callerContextAs('admin')
        );
        if (!shipped.success) throw new Error('ship refused');
    }
    return { user, game, orderId, fulfillmentOrderId: String(waiting._id) };
};

describe('cancelling a preorder that is still waiting for stock', () => {
    it('gives back the allowance, not shelf units, and refunds the preorder lines', async () => {
        const fixture = await shirtShippedPreorderWaiting();
        const gameId = String(fixture.game._id);

        const outcome = await returnService.createReturn(
            {
                orderId: fixture.orderId,
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: fixture.fulfillmentOrderId
            },
            asCustomer(fixture.user.id),
            testCallerContext
        );

        const cancellation = created(outcome);
        expect(cancellation.refundAmount).toBe(20);
        const board = await inventoryService.listPreorders();
        expect(board.items).toMatchObject([{ productId: gameId, preordered: 0, left: 5 }]);
        expect(await countersOf(gameId)).toMatchObject({ onHand: 0, reserved: 0 });
    });
});

describe('a preorder wait nobody answered', () => {
    const DAY = 86_400_000;

    /** The moment the 30 days after a sweep on `day 31` have run out. */
    const lateEnough = new Date(Date.now() + 62 * DAY);

    /** Ask the buyer (day 31), then let the window close and the sweep say so (day 62). */
    const letSilenceRunOut = async () => {
        await deliveryService.runPreorderSweep(new Date(Date.now() + 31 * DAY));
        await deliveryService.runPreorderSweep(lateEnough);
    };

    it('cancels what had not shipped as a no_answer return, refunds it, and gives the allowance back', async () => {
        const fixture = await shirtShippedPreorderWaiting();
        await letSilenceRunOut();

        await returnService.cancelUnanswered(
            fixture.orderId,
            fixture.fulfillmentOrderId,
            lateEnough
        );

        const [cancellation] = await returnRepository.findByOrderId(fixture.orderId);
        expect(cancellation).toMatchObject({
            kind: 'cancellation',
            reason: 'no_answer',
            status: 'closed',
            refundAmount: 20
        });
        expect(await refundsOf(fixture.orderId)).toEqual([{ reason: 'cancellation', amount: 20 }]);
        const board = await inventoryService.listPreorders();
        expect(board.items).toMatchObject([{ preordered: 0, left: 5 }]);
        const [, waiting] = await fulfillmentOrdersOf(fixture.orderId);
        expect([waiting.status, waiting.cancelReason]).toEqual(['cancelled', 'no_answer']);
    });

    // `delivery` announces the expiry again every day until a cancel lands, so a replay is routine.
    it('cancels once however often the expiry is announced: one return, one refund', async () => {
        const fixture = await shirtShippedPreorderWaiting();
        await letSilenceRunOut();

        await returnService.cancelUnanswered(
            fixture.orderId,
            fixture.fulfillmentOrderId,
            lateEnough
        );
        await returnService.cancelUnanswered(
            fixture.orderId,
            fixture.fulfillmentOrderId,
            lateEnough
        );

        expect(await returnRepository.findByOrderId(fixture.orderId)).toHaveLength(1);
        expect(await refundsOf(fixture.orderId)).toEqual([{ reason: 'cancellation', amount: 20 }]);
    });

    it('cancels nothing while another fulfillment order is alive and its goods are on the shelf', async () => {
        const fixture = await shirtShippedPreorderWaiting({ shipShirt: false });
        await letSilenceRunOut();

        await returnService.cancelUnanswered(
            fixture.orderId,
            fixture.fulfillmentOrderId,
            lateEnough
        );
        await settleOutboxNudges();

        const stored = await readOrder(fixture.orderId);
        expect(stored?.status).not.toBe(OrderStatus.cancelled);
        expect(await returnRepository.findByOrderId(fixture.orderId)).toEqual([]);
        expect(await refundsOf(fixture.orderId)).toEqual([]);
    });

    it('does nothing while the window is still open, so a "keep waiting" that came first wins', async () => {
        const fixture = await shirtShippedPreorderWaiting();
        // Asked on day 31 and not yet expired on day 40: the buyer may still answer.
        await deliveryService.runPreorderSweep(new Date(Date.now() + 31 * DAY));

        await returnService.cancelUnanswered(
            fixture.orderId,
            fixture.fulfillmentOrderId,
            new Date(Date.now() + 40 * DAY)
        );

        expect(await returnRepository.findByOrderId(fixture.orderId)).toEqual([]);
    });

    it('cancels the whole order, refunded in full, when nothing shipped and this is its only live fulfillment order', async () => {
        customers += 1;
        const user = await createUser({ email: `silent-${customers}@example.com` });
        const game = await createProduct({
            title: 'Game',
            price: 10,
            onHand: 0,
            releaseDate: new Date(Date.now() + 30 * DAY).toISOString()
        });
        const gameId = String(game._id);
        await inventoryService.setPreorderLimit(gameId, 5);
        const order = await createOrder(user, [toOrderItem(game, 2)], {
            shippingMethod: 'standard',
            shippingCost: 5
        });
        const orderId = String(order._id);
        await inventoryService.reserveForOrder(orderId, [
            { productId: gameId, quantity: 2, kind: 'preorder' }
        ]);
        const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        await paymentService.confirmPayment(
            intent.data.id,
            'pm_card_visa',
            asCustomer(user.id),
            testCallerContext
        );
        const [waiting] = await fulfillmentOrdersOf(orderId);
        await letSilenceRunOut();

        await returnService.cancelUnanswered(orderId, String(waiting._id), lateEnough);
        // The whole-order cancel's refund is its `order.cancelled` row, delivered by the relay.
        await settleOutboxNudges();

        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.cancelled);
        const board = await inventoryService.listPreorders();
        expect(board.items).toMatchObject([{ preordered: 0 }]);
        expect(await refundsOf(orderId)).toMatchObject([{ amount: 25 }]);
        // The fulfillment orders follow the order's cancel through the outbox.
        await settleOutboxNudges();
        const [cancelled] = await fulfillmentOrdersOf(orderId);
        expect([cancelled.status, cancelled.cancelReason]).toEqual(['cancelled', 'no_answer']);
    });
});
