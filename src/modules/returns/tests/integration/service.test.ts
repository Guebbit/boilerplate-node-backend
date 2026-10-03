/**
 * @module
 * Returns service against a real database — the guarantees are the conditional writes and the
 * scoping, so nothing here is mocked but the mail queue: a withdrawal before dispatch really
 * cancels the order and refunds the payment, a return on shipped goods really writes lines and
 * quantities, and two staff deciding one request really race.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    readOrder,
    setWithdrawUntil,
    toOrderItem,
    forceOrderStatus,
    markOrderPaidAt
} from '@modules/orders/tests/factories';
import { resetDomainEvents, onDomainEvent } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { OrderStatus } from '@types';
import paymentsModule from '@modules/payments/module';
import returnsModule from '../../module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import {
    asAdmin,
    asCustomer,
    asManager,
    asRole,
    testCallerContext,
    callerContextAs
} from '@tests/callers';
import { asReject } from '@tests/response';
import {
    approveReturn,
    createReturn,
    declineReturn,
    getReturn,
    listReturns,
    withActions
} from '../../services';
import { collectPersonalData } from '../../services/personal-data';
import { RETURN_CLOSED, RETURN_REQUESTED } from '../../events';
import { returnRepository } from '../../repository';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => resetDomainEvents());

/** A distinct address per customer — the users collection keeps one row per email. */
let customers = 0;

/** A customer with a two-product order, forced to `status`. */
const orderIn = async (status: OrderStatus) => {
    customers += 1;
    const user = await createUser({ email: `customer-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30 });
    const mug = await createProduct({ title: 'Mug', price: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)], { status });
    return { user, shirt, mug, order, orderId: String(order._id) };
};

/** The caller a customer's own requests run as. */
const buyer = (user: { id: string }) => asCustomer(user.id);

/** An order the customer has received, still inside its withdrawal window. */
const deliveredOrder = async () => {
    const fixture = await orderIn(OrderStatus.delivered);
    await setWithdrawUntil(fixture.orderId, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    return fixture;
};

describe('a withdrawal before dispatch', () => {
    it.each([OrderStatus.pending, OrderStatus.paid, OrderStatus.processing])(
        'cancels a %s order and writes a return closed at birth, acknowledged once',
        async (status) => {
            const { user, orderId } = await orderIn(status);

            const outcome = await createReturn(
                { orderId, reason: 'withdrawal' },
                buyer(user),
                testCallerContext
            );

            expect(outcome.kind).toBe('created');
            const stored = await readOrder(orderId);
            expect(stored?.status).toBe(OrderStatus.cancelled);
            const [written, ...others] = await returnRepository.findByOrderId(orderId);
            expect(others).toHaveLength(0);
            expect(written).toMatchObject({ status: 'closed', reason: 'withdrawal', lines: [] });
            expect(written?.decidedAt).toBeInstanceOf(Date);
            expect(written?.closedAt).toBeInstanceOf(Date);
            expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
            expect(mockEnqueueEmail.mock.calls[0][1]).toBe('returns.notice');
        }
    );

    it('owes nothing on an order nobody paid for, and the whole order on one that was paid', async () => {
        const unpaid = await orderIn(OrderStatus.pending);
        const paid = await orderIn(OrderStatus.paid);
        await markOrderPaidAt(paid.orderId, new Date());

        await createReturn(
            { orderId: unpaid.orderId, reason: 'withdrawal' },
            buyer(unpaid.user),
            testCallerContext
        );
        await createReturn(
            { orderId: paid.orderId, reason: 'withdrawal' },
            buyer(paid.user),
            testCallerContext
        );

        const [onUnpaid] = await returnRepository.findByOrderId(unpaid.orderId);
        const [onPaid] = await returnRepository.findByOrderId(paid.orderId);
        expect(onUnpaid?.refundAmount).toBe(0);
        // Two shirts at 30 and a mug at 10.
        expect(onPaid?.refundAmount).toBe(70);
    });

    it('announces the return opened and finished, once each', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);
        const heard: string[] = [];
        onDomainEvent(RETURN_REQUESTED, ({ orderId: id }) => void heard.push(`requested ${id}`));
        onDomainEvent(RETURN_CLOSED, ({ orderId: id }) => void heard.push(`closed ${id}`));

        await createReturn({ orderId, reason: 'withdrawal' }, buyer(user), testCallerContext);

        // The events are announced fire-and-forget: let their listeners run.
        await new Promise((resolve) => setImmediate(resolve));
        expect(heard).toEqual([`requested ${orderId}`, `closed ${orderId}`]);
    });

    it('leaves the order showing no return: nothing comes back', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);

        await createReturn({ orderId, reason: 'withdrawal' }, buyer(user), testCallerContext);

        const stored = await readOrder(orderId);
        expect(stored?.toJSON().returnStatus).toBe('none');
    });

    it('cannot be made twice: the cancelled order is not returnable', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);
        await createReturn({ orderId, reason: 'withdrawal' }, buyer(user), testCallerContext);

        const again = await createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(again.kind === 'refused' && again.reject.errors[0]).toMatchObject({
            code: 'RETURN_ORDER_NOT_RETURNABLE'
        });
        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(1);
    });

    it('is not offered to another customer, whose order is a 404', async () => {
        const { orderId } = await orderIn(OrderStatus.paid);
        const stranger = await createUser({ email: 'stranger@example.com' });

        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(stranger),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.status).toBe(404);
        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.paid);
    });

    it('is not offered to an operator either — the right is the consumer’s', async () => {
        const { orderId } = await orderIn(OrderStatus.paid);

        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            asAdmin(),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.status).toBe(404);
    });

    it('refuses any other reason before dispatch — nothing has left the shop to send back', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);

        const outcome = await createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.errors[0]).toMatchObject({
            code: 'RETURN_ORDER_NOT_RETURNABLE'
        });
    });
});

/** A delivered order of one withdrawable shirt and one excluded engraved mug. */
const orderWithExcluded = async () => {
    customers += 1;
    const user = await createUser({ email: `customer-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30 });
    const engraved = await createProduct({
        title: 'Engraved mug',
        price: 10,
        noWithdrawal: true
    });
    const order = await createOrder(user, [toOrderItem(shirt, 1), toOrderItem(engraved, 1)], {
        status: OrderStatus.delivered
    });
    const orderId = String(order._id);
    await setWithdrawUntil(orderId, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    return { user, shirt, engraved, orderId };
};

describe('goods excluded from the right of withdrawal (Art. 16)', () => {
    it('leaves the excluded line out of a withdrawal that names no lines', async () => {
        const { user, shirt, orderId } = await orderWithExcluded();

        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        if (outcome.kind !== 'created') throw new Error('expected a return');
        expect(outcome.created.lines.map(({ productId }) => String(productId))).toEqual([
            String(shirt._id)
        ]);
    });

    it('refuses a return that names an excluded line', async () => {
        const { user, engraved, orderId } = await orderWithExcluded();

        const outcome = await createReturn(
            {
                orderId,
                reason: 'withdrawal',
                lines: [{ productId: String(engraved._id), quantity: 1 }]
            },
            buyer(user),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.status).toBe(422);
        expect(outcome.kind === 'refused' && outcome.reject.errors[0]).toMatchObject({
            code: 'RETURN_LINES_INVALID'
        });
    });

    it('keeps a whole-order withdrawal before dispatch from cancelling an order holding one', async () => {
        customers += 1;
        const user = await createUser({ email: `customer-${customers}@example.com` });
        const engraved = await createProduct({ noWithdrawal: true });
        const order = await createOrder(user, [toOrderItem(engraved, 1)], {
            status: OrderStatus.paid
        });

        const outcome = await createReturn(
            { orderId: String(order._id), reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.status).toBe(422);
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.paid);
    });
});

describe('a return on goods that have shipped', () => {
    it.each([OrderStatus.shipped, OrderStatus.delivered])(
        'writes a withdrawal on a %s order born approved, with every line, and announces it once',
        async (status) => {
            const { user, shirt, mug, orderId } = await orderIn(status);
            const events: unknown[] = [];
            onDomainEvent(RETURN_REQUESTED, (payload) => events.push(payload));

            const outcome = await createReturn(
                { orderId, reason: 'withdrawal' },
                buyer(user),
                testCallerContext
            );

            if (outcome.kind !== 'created') throw new Error('expected a return');
            expect(outcome.created).toMatchObject({
                status: 'approved',
                reason: 'withdrawal',
                returnPostage: 'consumer',
                currency: 'EUR'
            });
            expect(outcome.created.decidedAt).toBeInstanceOf(Date);
            expect(
                outcome.created.lines.map(({ productId, quantity, title, unitPrice }) => ({
                    productId: String(productId),
                    quantity,
                    title,
                    unitPrice
                }))
            ).toEqual([
                { productId: String(shirt._id), quantity: 2, title: 'Shirt', unitPrice: 30 },
                { productId: String(mug._id), quantity: 1, title: 'Mug', unitPrice: 10 }
            ]);
            expect(events).toEqual([
                { returnId: String(outcome.created._id), orderId, reason: 'withdrawal' }
            ]);
            expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        }
    );

    it('leaves the order where it is — a return is its own object, delivered stays terminal', async () => {
        const { user, orderId } = await deliveredOrder();

        await createReturn({ orderId, reason: 'withdrawal' }, buyer(user), testCallerContext);

        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.delivered);
    });

    it('waits for staff when the reason is not a withdrawal', async () => {
        const { user, orderId } = await deliveredOrder();

        const outcome = await createReturn(
            { orderId, reason: 'defective', note: 'Cracked handle' },
            buyer(user),
            testCallerContext
        );

        if (outcome.kind !== 'created') throw new Error('expected a return');
        expect(outcome.created.status).toBe('requested');
        expect(outcome.created.decidedAt).toBeUndefined();
        expect(outcome.created.note).toBe('Cracked handle');
    });

    it('returns only the named lines, and only as many units as were bought', async () => {
        const { user, mug, orderId } = await deliveredOrder();

        const outcome = await createReturn(
            { orderId, reason: 'defective', lines: [{ productId: String(mug._id), quantity: 1 }] },
            buyer(user),
            testCallerContext
        );

        if (outcome.kind !== 'created') throw new Error('expected a return');
        expect(outcome.created.lines).toHaveLength(1);
    });

    it('refuses more units than the order held', async () => {
        const { user, shirt, orderId } = await deliveredOrder();

        const outcome = await createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(shirt._id), quantity: 3 }]
            },
            buyer(user),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.status).toBe(422);
        expect(outcome.kind === 'refused' && outcome.reject.errors[0]).toMatchObject({
            code: 'RETURN_LINES_INVALID'
        });
    });

    it('refuses a product that is not on the order', async () => {
        const { user, orderId } = await deliveredOrder();
        const other = await createProduct();

        const outcome = await createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(other._id), quantity: 1 }]
            },
            buyer(user),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.status).toBe(422);
    });

    it('counts what earlier returns took — the same units cannot come back twice', async () => {
        const { user, shirt, orderId } = await deliveredOrder();
        const oneShirt = [{ productId: String(shirt._id), quantity: 1 }];
        await createReturn(
            { orderId, reason: 'defective', lines: oneShirt },
            buyer(user),
            testCallerContext
        );
        await createReturn(
            { orderId, reason: 'defective', lines: oneShirt },
            buyer(user),
            testCallerContext
        );

        const third = await createReturn(
            { orderId, reason: 'defective', lines: oneShirt },
            buyer(user),
            testCallerContext
        );

        expect(third.kind === 'refused' && third.reject.status).toBe(422);
    });

    it('gives the units of a declined return back', async () => {
        const { user, shirt, orderId } = await deliveredOrder();
        const twoShirts = [{ productId: String(shirt._id), quantity: 2 }];
        const first = await createReturn(
            { orderId, reason: 'defective', lines: twoShirts },
            buyer(user),
            testCallerContext
        );
        if (first.kind !== 'created') throw new Error('expected a return');
        await declineReturn(String(first.created._id), 'Used', callerContextAs('admin'));

        const again = await createReturn(
            { orderId, reason: 'defective', lines: twoShirts },
            buyer(user),
            testCallerContext
        );

        expect(again.kind).toBe('created');
    });

    it('refuses once the window has closed', async () => {
        const { user, orderId } = await orderIn(OrderStatus.delivered);
        await setWithdrawUntil(orderId, new Date(Date.now() - 1000));

        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.errors[0]).toMatchObject({
            code: 'RETURN_WINDOW_CLOSED'
        });
    });

    it('refuses a cancelled order', async () => {
        const { user, orderId } = await orderIn(OrderStatus.cancelled);

        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(outcome.kind === 'refused' && outcome.reject.errors[0]).toMatchObject({
            code: 'RETURN_ORDER_NOT_RETURNABLE'
        });
    });
});

/** A `requested` return on a delivered order. */
const requestedReturn = async () => {
    const fixture = await deliveredOrder();
    const outcome = await createReturn(
        { orderId: fixture.orderId, reason: 'defective' },
        buyer(fixture.user),
        testCallerContext
    );
    if (outcome.kind !== 'created') throw new Error('expected a return');
    return { ...fixture, returnId: String(outcome.created._id) };
};

describe('deciding a request', () => {
    it('approves it, stamps when, and tells the customer', async () => {
        const { returnId } = await requestedReturn();
        mockEnqueueEmail.mockClear();

        const result = await approveReturn(returnId, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('approved');
        expect(result.success && result.data.decidedAt).toBeInstanceOf(Date);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('declines it with the reason, and the customer is mailed the reason', async () => {
        const { returnId } = await requestedReturn();
        mockEnqueueEmail.mockClear();

        const result = await declineReturn(returnId, 'Worn', callerContextAs('admin'));

        expect(result.success && result.data).toMatchObject({
            status: 'declined',
            declineReason: 'Worn'
        });
        expect(JSON.stringify(mockEnqueueEmail.mock.calls[0][2])).toContain('Worn');
    });

    it('lets exactly one of two racing decisions win', async () => {
        const { returnId } = await requestedReturn();

        const results = await Promise.all([
            approveReturn(returnId, callerContextAs('admin')),
            declineReturn(returnId, 'No', callerContextAs('admin'))
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
        const loser = results.find((result) => !result.success);
        expect(loser && asReject(loser).status).toBe(409);
        expect(loser && asReject(loser).errors[0].code).toBe('RETURN_NOT_DECIDABLE');
    });

    it('does not decide a withdrawal — it was born approved', async () => {
        const { user, orderId } = await deliveredOrder();
        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );
        if (outcome.kind !== 'created') throw new Error('expected a return');

        const result = await declineReturn(
            String(outcome.created._id),
            'No',
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(409);
    });

    it('answers 404 for a return that does not exist', async () => {
        const result = await approveReturn('a'.repeat(24), callerContextAs('admin'));

        expect(asReject(result).status).toBe(404);
    });
});

describe('who sees which return', () => {
    it('shows a customer their own returns and staff all of them', async () => {
        const mine = await requestedReturn();
        await requestedReturn();

        const own = await listReturns({}, buyer(mine.user));
        const staff = await listReturns({}, asManager());

        expect(own.items.map(({ id }) => id)).toEqual([mine.returnId]);
        expect(staff.items).toHaveLength(2);
    });

    it('never shows a customer another order’s returns, whatever they filter by', async () => {
        const mine = await requestedReturn();
        const theirs = await requestedReturn();

        const page = await listReturns({ orderId: theirs.orderId }, buyer(mine.user));

        expect(page.items).toEqual([]);
    });

    it('filters by status for staff', async () => {
        const { returnId } = await requestedReturn();
        await requestedReturn();
        await approveReturn(returnId, callerContextAs('admin'));

        const page = await listReturns({ status: 'approved' }, asManager());

        expect(page.items.map(({ id }) => id)).toEqual([returnId]);
    });

    it('reads one return for its own buyer and for staff, but 404s a stranger', async () => {
        const { user, returnId } = await requestedReturn();
        const stranger = await createUser({ email: 'stranger@example.com' });

        const asBuyer = await getReturn(returnId, buyer(user));
        const asSupport = await getReturn(returnId, asRole('support'));
        const asStranger = await getReturn(returnId, buyer(stranger));

        expect(asBuyer.success).toBe(true);
        expect(asSupport.success).toBe(true);
        expect(asReject(asStranger).status).toBe(404);
    });

    it('offers staff approve and decline on a request, and a customer nothing', async () => {
        const { user, returnId } = await requestedReturn();
        const stored = await returnRepository.findById(returnId);

        expect(withActions(stored!, asManager()).actions).toEqual({
            approve: true,
            decline: true,
            receive: false
        });
        expect(withActions(stored!, buyer(user)).actions).toEqual({
            approve: false,
            decline: false,
            receive: false
        });
    });

    it('offers the warehouse receive on an approved return, and not approve', async () => {
        const { returnId } = await requestedReturn();
        await approveReturn(returnId, callerContextAs('admin'));
        const stored = await returnRepository.findById(returnId);

        expect(withActions(stored!, asRole('warehouse')).actions).toEqual({
            approve: false,
            decline: false,
            receive: true
        });
    });
});

describe('the account export', () => {
    it('carries the returns on the account’s own orders, and no one else’s', async () => {
        const mine = await requestedReturn();
        await requestedReturn();
        // Detaching the account (erasure) must not lose the record — it is keyed by the order.
        await forceOrderStatus(mine.orderId, OrderStatus.delivered);

        const exported = await collectPersonalData(mine.user.id);

        expect(exported).toHaveLength(1);
        expect(exported[0]).toMatchObject({ orderId: mine.orderId, reason: 'defective' });
        expect(exported[0].lines.map(({ title }) => title).toSorted()).toEqual(['Mug', 'Shirt']);
    });
});
