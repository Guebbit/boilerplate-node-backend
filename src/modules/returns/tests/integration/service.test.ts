/**
 * @module
 * Returns service against a real database — the guarantees are the conditional writes and the
 * scoping, so nothing here is mocked but the mail queue: a withdrawal before dispatch really
 * cancels the order and refunds the payment, a return on shipped goods really writes lines and
 * quantities, and two staff deciding one request really race.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment, withEnvironmentOverrides } from '@tests/environment';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    readOrder,
    setConformityUntil,
    setWithdrawUntil,
    toOrderItem,
    markOrderPaidAt
} from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { resetDomainEvents, onDomainEvent } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
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
import { asStub } from '@tests/stub';
import { returnService } from '../../services';
import { collectPersonalData } from '../../services/personal-data';
import { RETURN_CLOSED, RETURN_REQUESTED } from '../../events';
import { returnRepository } from '../../repository';
import { returnsAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { orderService } from '@modules/orders';
import { seedMembership } from '@modules/access/tests/factories';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

/* Replaced, not spied on — `recordAudit` closes over its own module's `emitAuditEvent`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);
const mockEmitAuditEvent = auditPort.emitAuditEvent as jest.MockedFunction<
    typeof auditPort.emitAuditEvent
>;

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
    mockEnqueueEmail.mockClear();
    mockEmitAuditEvent.mockClear();
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A distinct address per customer — the users collection keeps one row per email. */
let customers = 0;

/** A customer with a two-product order, forced to `status`. */
const orderIn = async (status: OrderStatus) => {
    customers += 1;
    const user = await createUser({ email: `customer-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30 });
    const mug = await createProduct({ title: 'Mug', price: 10 });
    const carried = status === OrderStatus.shipped || status === OrderStatus.delivered;
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)], {
        status: carried ? OrderStatus.processing : status
    });
    // Goods that left or arrived get there through the real doors, so the shipments exist.
    if (carried) {
        await carryOrderTo(String(order._id), status);
        // The shipped and delivered mails belong to the setup, not to what the test is about: let
        // their events land before clearing.
        await settleOutboxNudges();
        mockEnqueueEmail.mockClear();
    }
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

            const outcome = await returnService.createReturn(
                { orderId, reason: 'withdrawal' },
                buyer(user),
                testCallerContext
            );

            expect(outcome.success).toBe(true);
            await settleOutboxNudges();
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

        await returnService.createReturn(
            { orderId: unpaid.orderId, reason: 'withdrawal' },
            buyer(unpaid.user),
            testCallerContext
        );
        await returnService.createReturn(
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

        await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        // The events ride the outbox: let the relay deliver them.
        await settleOutboxNudges();
        expect(heard).toEqual([`requested ${orderId}`, `closed ${orderId}`]);
    });

    it('leaves the order showing no return: nothing comes back', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);

        await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        const stored = await readOrder(orderId);
        expect(stored?.toJSON().returnStatus).toBe('none');
    });

    it('cannot be made twice: the cancelled order is not returnable', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);
        await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        const again = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(!again.success && again.errors[0]).toMatchObject({
            code: 'RETURN_ORDER_NOT_RETURNABLE'
        });
        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(1);
    });

    it('is not offered to another customer, whose order is a 404', async () => {
        const { orderId } = await orderIn(OrderStatus.paid);
        const stranger = await createUser({ email: 'stranger@example.com' });

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(stranger),
            testCallerContext
        );

        expect(!outcome.success && outcome.status).toBe(404);
        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.paid);
    });

    it('is not offered to an operator either — the right is the consumer’s', async () => {
        const { orderId } = await orderIn(OrderStatus.paid);

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            asAdmin(),
            testCallerContext
        );

        expect(!outcome.success && outcome.status).toBe(404);
    });

    it('refuses any other reason before dispatch — nothing has left the shop to send back', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.errors[0]).toMatchObject({
            code: 'RETURN_ORDER_NOT_RETURNABLE'
        });
    });
});

/** A delivered order of one withdrawable shirt and one excluded engraved mug. */
const orderWithExcluded = async (carriedTo: 'delivered' | null = 'delivered') => {
    customers += 1;
    const user = await createUser({ email: `customer-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30 });
    const engraved = await createProduct({
        title: 'Engraved mug',
        price: 10,
        noWithdrawal: true
    });
    const order = await createOrder(user, [toOrderItem(shirt, 1), toOrderItem(engraved, 1)], {
        status: OrderStatus.processing
    });
    const orderId = String(order._id);
    if (carriedTo) await carryOrderTo(orderId, carriedTo);
    mockEnqueueEmail.mockClear();
    await setWithdrawUntil(orderId, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    return { user, shirt, engraved, orderId };
};

/** A paid order made wholly of one excluded engraved mug, nothing shipped. */
const onlyExcludedOrder = async () => {
    customers += 1;
    const user = await createUser({ email: `customer-${customers}@example.com` });
    const engraved = await createProduct({ title: 'Engraved mug', price: 10, noWithdrawal: true });
    const order = await createOrder(user, [toOrderItem(engraved, 1)], {
        status: OrderStatus.paid
    });
    return { user, orderId: String(order._id) };
};

describe('goods excluded from the right of withdrawal (Art. 16)', () => {
    it('leaves the excluded line out of a withdrawal that names no lines', async () => {
        const { user, shirt, orderId } = await orderWithExcluded();

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        if (!outcome.success) throw new Error('expected a return');
        expect(outcome.data.lines.map(({ productId }) => String(productId))).toEqual([
            String(shirt._id)
        ]);
    });

    // Only a defect brings an excluded line back (the guarantee covers it); any other reason names
    // goods the withdrawal right never reached.
    it.each(['withdrawal', 'other'] as const)(
        'refuses a %s return that names an excluded line',
        async (reason) => {
            const { user, engraved, orderId } = await orderWithExcluded();

            const outcome = await returnService.createReturn(
                {
                    orderId,
                    reason,
                    lines: [{ productId: String(engraved._id), quantity: 1 }]
                },
                buyer(user),
                testCallerContext
            );

            expect(!outcome.success && outcome.status).toBe(422);
            expect(!outcome.success && outcome.errors[0]).toMatchObject({
                code: 'RETURN_LINES_INVALID'
            });
        }
    );

    it('takes a defective made-to-order line, which the guarantee covers', async () => {
        const { user, engraved, orderId } = await orderWithExcluded();

        const outcome = await returnService.createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(engraved._id), quantity: 1 }]
            },
            buyer(user),
            testCallerContext
        );

        expect(outcome.success).toBe(true);
    });

    it('keeps a whole-order withdrawal before dispatch from cancelling an order holding one', async () => {
        customers += 1;
        const user = await createUser({ email: `customer-${customers}@example.com` });
        const engraved = await createProduct({ noWithdrawal: true });
        const order = await createOrder(user, [toOrderItem(engraved, 1)], {
            status: OrderStatus.paid
        });

        const outcome = await returnService.createReturn(
            { orderId: String(order._id), reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.status).toBe(422);
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

            const outcome = await returnService.createReturn(
                { orderId, reason: 'withdrawal' },
                buyer(user),
                testCallerContext
            );
            await settleOutboxNudges();

            if (!outcome.success) throw new Error('expected a return');
            expect(outcome.data).toMatchObject({
                status: 'approved',
                reason: 'withdrawal',
                returnPostage: 'consumer',
                currency: 'EUR'
            });
            expect(outcome.data.decidedAt).toBeInstanceOf(Date);
            expect(
                outcome.data.lines.map(({ productId, quantity, title, unitPrice }) => ({
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
                { returnId: String(outcome.data._id), orderId, reason: 'withdrawal' }
            ]);
            expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        }
    );

    it('freezes who pays the postage when the return is opened', () =>
        withEnvironmentOverrides({ NODE_RETURN_POSTAGE_PAYER: 'shop' }, async () => {
            const { user, orderId } = await orderIn(OrderStatus.delivered);

            const outcome = await returnService.createReturn(
                { orderId, reason: 'withdrawal' },
                buyer(user),
                testCallerContext
            );

            if (!outcome.success) throw new Error('expected a return');
            expect(outcome.data.returnPostage).toBe('shop');
            // What the customer was told stays on the row, whatever the setting says later.
            const stored = await returnRepository.findById(String(outcome.data._id));
            expect(stored?.returnPostage).toBe('shop');
        }));

    it('leaves the order where it is — a return is its own object, delivered stays terminal', async () => {
        const { user, orderId } = await deliveredOrder();

        await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        const stored = await readOrder(orderId);
        expect(stored?.status).toBe(OrderStatus.delivered);
    });

    it('waits for staff when the reason is not a withdrawal', async () => {
        const { user, orderId } = await deliveredOrder();

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective', note: 'Cracked handle' },
            buyer(user),
            testCallerContext
        );

        if (!outcome.success) throw new Error('expected a return');
        expect(outcome.data.status).toBe('requested');
        expect(outcome.data.decidedAt).toBeUndefined();
        expect(outcome.data.note).toBe('Cracked handle');
    });

    it('returns only the named lines, and only as many units as were bought', async () => {
        const { user, mug, orderId } = await deliveredOrder();

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective', lines: [{ productId: String(mug._id), quantity: 1 }] },
            buyer(user),
            testCallerContext
        );

        if (!outcome.success) throw new Error('expected a return');
        expect(outcome.data.lines).toHaveLength(1);
    });

    it('refuses more units than the order held', async () => {
        const { user, shirt, orderId } = await deliveredOrder();

        const outcome = await returnService.createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(shirt._id), quantity: 3 }]
            },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.status).toBe(422);
        expect(!outcome.success && outcome.errors[0]).toMatchObject({
            code: 'RETURN_LINES_INVALID'
        });
    });

    it('refuses a product that is not on the order', async () => {
        const { user, orderId } = await deliveredOrder();
        const other = await createProduct();

        const outcome = await returnService.createReturn(
            {
                orderId,
                reason: 'defective',
                lines: [{ productId: String(other._id), quantity: 1 }]
            },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.status).toBe(422);
    });

    it('counts what earlier returns took — the same units cannot come back twice', async () => {
        const { user, shirt, orderId } = await deliveredOrder();
        const oneShirt = [{ productId: String(shirt._id), quantity: 1 }];
        await returnService.createReturn(
            { orderId, reason: 'defective', lines: oneShirt },
            buyer(user),
            testCallerContext
        );
        await returnService.createReturn(
            { orderId, reason: 'defective', lines: oneShirt },
            buyer(user),
            testCallerContext
        );

        const third = await returnService.createReturn(
            { orderId, reason: 'defective', lines: oneShirt },
            buyer(user),
            testCallerContext
        );

        expect(!third.success && third.status).toBe(422);
    });

    it('lets exactly one of two parallel full returns through, and announces only that one', async () => {
        const { user, orderId } = await deliveredOrder();
        const events: unknown[] = [];
        onDomainEvent(RETURN_REQUESTED, (payload) => events.push(payload));
        mockEnqueueEmail.mockClear();

        const outcomes = await Promise.all([
            returnService.createReturn(
                { orderId, reason: 'defective' },
                buyer(user),
                testCallerContext
            ),
            returnService.createReturn(
                { orderId, reason: 'defective' },
                buyer(user),
                testCallerContext
            )
        ]);
        await settleOutboxNudges();

        // Snapshot isolation alone would let both read "nothing returned" and both commit.
        expect(outcomes.filter(({ success }) => success)).toHaveLength(1);
        const loser = outcomes.find(({ success }) => !success);
        expect(loser && !loser.success && loser.status).toBe(422);
        expect(events).toHaveLength(1);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('gives the units of a declined return back', async () => {
        const { user, shirt, orderId } = await deliveredOrder();
        const twoShirts = [{ productId: String(shirt._id), quantity: 2 }];
        const first = await returnService.createReturn(
            { orderId, reason: 'defective', lines: twoShirts },
            buyer(user),
            testCallerContext
        );
        if (!first.success) throw new Error('expected a return');
        await returnService.declineReturn(String(first.data._id), 'Used', callerContextAs('admin'));

        const again = await returnService.createReturn(
            { orderId, reason: 'defective', lines: twoShirts },
            buyer(user),
            testCallerContext
        );

        expect(again.success).toBe(true);
    });

    it('refuses once the window has closed', async () => {
        const { user, orderId } = await orderIn(OrderStatus.delivered);
        await setWithdrawUntil(orderId, new Date(Date.now() - 1000));

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.errors[0]).toMatchObject({
            code: 'RETURN_WINDOW_CLOSED'
        });
    });

    it('still takes a defect after the withdrawal period, and refuses the rest of the reasons', async () => {
        const { user, orderId } = await orderIn(OrderStatus.delivered);
        await setWithdrawUntil(orderId, new Date(Date.now() - 1000));

        const reasons = ['withdrawal', 'other', 'defective', 'wrong_item'] as const;
        const outcomes = await Promise.all(
            reasons.map((reason) =>
                returnService.createReturn(
                    { orderId, reason, lines: [{ productId: reason, quantity: 1 }] },
                    buyer(user),
                    testCallerContext
                )
            )
        );

        // The two withdrawal-period reasons are shut; the two guarantee reasons got past the
        // deadline check (their made-up line is then refused for what it is, not for the date).
        expect(outcomes.map((o) => !o.success && o.errors[0].code)).toEqual([
            'RETURN_WINDOW_CLOSED',
            'RETURN_WINDOW_CLOSED',
            'RETURN_LINES_INVALID',
            'RETURN_LINES_INVALID'
        ]);
    });

    it('refuses a defect once the two years are over, in the guarantee’s own words', async () => {
        const { user, orderId } = await orderIn(OrderStatus.delivered);
        await setWithdrawUntil(orderId, new Date(Date.now() - 2000));
        await setConformityUntil(orderId, new Date(Date.now() - 1000));

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.errors[0]).toMatchObject({
            code: 'RETURN_WINDOW_CLOSED',
            message: 'The two years of legal guarantee for this order have ended.'
        });
    });

    it('refuses a cancelled order', async () => {
        const { user, orderId } = await orderIn(OrderStatus.cancelled);

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.errors[0]).toMatchObject({
            code: 'RETURN_ORDER_NOT_RETURNABLE'
        });
    });
});

/** A `requested` return on a delivered order. */
const requestedReturn = async () => {
    const fixture = await deliveredOrder();
    const outcome = await returnService.createReturn(
        { orderId: fixture.orderId, reason: 'defective' },
        buyer(fixture.user),
        testCallerContext
    );
    if (!outcome.success) throw new Error('expected a return');
    // The acknowledgement rides `return.requested`: let it land, so it is the setup's, not the test's.
    await settleOutboxNudges();
    return { ...fixture, returnId: String(outcome.data._id) };
};

describe('deciding a request', () => {
    it('approves it, stamps when, and tells the customer', async () => {
        const { returnId } = await requestedReturn();
        mockEnqueueEmail.mockClear();

        const result = await returnService.approveReturn(returnId, callerContextAs('admin'));
        await settleOutboxNudges();

        expect(result.success && result.data.status).toBe('approved');
        expect(result.success && result.data.decidedAt).toBeInstanceOf(Date);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('declines it with the reason, and the customer is mailed the reason', async () => {
        const { returnId } = await requestedReturn();
        mockEnqueueEmail.mockClear();

        const result = await returnService.declineReturn(
            returnId,
            'Worn',
            callerContextAs('admin')
        );
        await settleOutboxNudges();

        expect(result.success && result.data).toMatchObject({
            status: 'declined',
            declineReason: 'Worn'
        });
        expect(JSON.stringify(mockEnqueueEmail.mock.calls[0][2])).toContain('Worn');
    });

    it('lets exactly one of two racing decisions win', async () => {
        const { returnId } = await requestedReturn();

        const results = await Promise.all([
            returnService.approveReturn(returnId, callerContextAs('admin')),
            returnService.declineReturn(returnId, 'No', callerContextAs('admin'))
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
        const loser = results.find((result) => !result.success);
        expect(loser && asReject(loser).status).toBe(409);
        expect(loser && asReject(loser).errors[0].code).toBe('RETURN_NOT_DECIDABLE');
    });

    it('does not decide a withdrawal — it was born approved', async () => {
        const { user, orderId } = await deliveredOrder();
        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );
        if (!outcome.success) throw new Error('expected a return');

        const result = await returnService.declineReturn(
            String(outcome.data._id),
            'No',
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(409);
    });

    // Holding the key is the whole rule: a buyer promoted to staff decides their own return like
    // anyone's, and the refund step that follows is the one the audit row flags.
    it('lets a promoted buyer approve their own return', async () => {
        const { user, returnId } = await requestedReturn();
        await seedMembership(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'manager');

        const approval = await returnService.approveReturn(
            returnId,
            callerContextAs('manager', user.id)
        );

        expect(approval.success && approval.data.status).toBe('approved');
    });

    it('lets a promoted buyer decline their own return', async () => {
        const { user, returnId } = await requestedReturn();
        await seedMembership(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'manager');

        const declined = await returnService.declineReturn(
            returnId,
            'Changed my mind',
            callerContextAs('manager', user.id)
        );

        expect(declined.success && declined.data.status).toBe('declined');
    });

    it('answers 404 for a return that does not exist', async () => {
        const result = await returnService.approveReturn('a'.repeat(24), callerContextAs('admin'));

        expect(asReject(result).status).toBe(404);
    });
});

/** What a caller is offered on a stored return — `withActions`' `actions`. */
const actionsOf = (
    ...args: Parameters<typeof returnService.withActions>
): ReturnType<typeof returnService.withActions>['actions'] =>
    returnService.withActions(...args).actions;

describe('who sees which return', () => {
    it('shows a customer their own returns and staff all of them', async () => {
        const mine = await requestedReturn();
        await requestedReturn();

        const own = await returnService.listReturns({}, buyer(mine.user));
        const staff = await returnService.listReturns({}, asManager());

        expect(own.items.map(({ id }) => id)).toEqual([mine.returnId]);
        expect(staff.items).toHaveLength(2);
    });

    it('never shows a customer another order’s returns, whatever they filter by', async () => {
        const mine = await requestedReturn();
        const theirs = await requestedReturn();

        const page = await returnService.listReturns({ orderId: theirs.orderId }, buyer(mine.user));

        expect(page.items).toEqual([]);
    });

    it('filters by status for staff', async () => {
        const { returnId } = await requestedReturn();
        await requestedReturn();
        await returnService.approveReturn(returnId, callerContextAs('admin'));

        const page = await returnService.listReturns({ status: 'approved' }, asManager());

        expect(page.items.map(({ id }) => id)).toEqual([returnId]);
    });

    it('reads one return for its own buyer and for staff, but 404s a stranger', async () => {
        const { user, returnId } = await requestedReturn();
        const stranger = await createUser({ email: 'stranger@example.com' });

        const asBuyer = await returnService.getReturn(returnId, buyer(user));
        const asSupport = await returnService.getReturn(returnId, asRole('support'));
        const asStranger = await returnService.getReturn(returnId, buyer(stranger));

        expect(asBuyer.success).toBe(true);
        expect(asSupport.success).toBe(true);
        expect(asReject(asStranger).status).toBe(404);
    });

    it('offers staff approve and decline on a request, and a customer nothing', async () => {
        const { user, returnId } = await requestedReturn();
        const stored = await returnRepository.findById(returnId);

        expect(actionsOf(stored!, asManager())).toEqual({
            approve: true,
            decline: true,
            receive: false
        });
        expect(actionsOf(stored!, buyer(user))).toEqual({
            approve: false,
            decline: false,
            receive: false
        });
    });

    // Holding the key is enough: a staff member who is also the buyer is a customer first, so the
    // permission decides, and the money step is recorded rather than refused.
    it('offers a staff buyer the same decisions on their own return as any other staff member', async () => {
        const { user, returnId } = await requestedReturn();
        await seedMembership(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'manager');
        const stored = await returnRepository.findById(returnId);

        expect(actionsOf(stored!, asRole('manager', user.id))).toEqual({
            approve: true,
            decline: true,
            receive: false
        });
    });

    it('offers the warehouse receive on an approved return, and not approve', async () => {
        const { returnId } = await requestedReturn();
        await returnService.approveReturn(returnId, callerContextAs('admin'));
        const stored = await returnRepository.findById(returnId);

        expect(actionsOf(stored!, asRole('warehouse'))).toEqual({
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
        await carryOrderTo(mine.orderId, 'delivered');

        const exported = await collectPersonalData(mine.user.id);

        expect(exported).toHaveLength(1);
        expect(exported[0]).toMatchObject({ orderId: mine.orderId, reason: 'defective' });
        expect(exported[0].lines.map(({ title }) => title).toSorted()).toEqual(['Mug', 'Shirt']);
    });

    it('carries the text staff wrote when declining, and omits it while there is none', async () => {
        const declined = await requestedReturn();
        const open = await requestedReturn();
        await returnService.declineReturn(
            declined.returnId,
            'Worn beyond a trial',
            callerContextAs('admin')
        );

        const [declinedSection] = await collectPersonalData(declined.user.id);
        const [openSection] = await collectPersonalData(open.user.id);

        expect(declinedSection).toMatchObject({ declineReason: 'Worn beyond a trial' });
        expect(openSection).not.toHaveProperty('declineReason');
    });
});

/** The `data` payload of the nth mail queued, or a loud failure. */
const mailData = (call = 0): { address?: string; body: string } => {
    const data: unknown = mockEnqueueEmail.mock.calls[call]?.[2];
    return asStub<{ address?: string; body: string }>(data);
};

/** The subject of the nth mail queued. */
const mailSubject = (call = 0): string | undefined =>
    mockEnqueueEmail.mock.calls[call]?.[0].subject;

/** The audit events recorded under one action. */
const auditedAs = (action: string) =>
    mockEmitAuditEvent.mock.calls
        .map(([event]) => event)
        .filter((event) => event.action === action);

describe('what a refusal says', () => {
    it('names the order as missing when a customer opens a return on one that is not theirs', async () => {
        const { orderId } = await deliveredOrder();
        const stranger = await createUser({ email: 'stranger-refusal@example.com' });

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(stranger),
            testCallerContext
        );

        expect(!outcome.success && outcome.errors[0]).toMatchObject({
            message: 'The order was not found'
        });
    });

    it('says which line check failed, in words', async () => {
        const { user, shirt, orderId } = await deliveredOrder();
        const other = await createProduct();
        const refuse = (productId: string, quantity: number) =>
            returnService
                .createReturn(
                    { orderId, reason: 'defective', lines: [{ productId, quantity }] },
                    buyer(user),
                    testCallerContext
                )
                .then((outcome) => (outcome.success ? undefined : outcome.errors[0]));

        expect(await refuse(String(other._id), 1)).toMatchObject({
            code: 'RETURN_LINES_INVALID',
            message: 'One of the lines names a product that is not on this order.'
        });
        expect(await refuse(String(shirt._id), 3)).toMatchObject({
            code: 'RETURN_LINES_INVALID',
            message: 'One of the lines asks to return more than is left of it.'
        });
    });

    it('says nothing is left to return once everything has been taken back', async () => {
        const { user, orderId } = await deliveredOrder();
        await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );

        const again = await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );

        expect(!again.success && again.errors[0]).toMatchObject({
            code: 'RETURN_LINES_INVALID',
            message: 'Nothing on this order is left to return.'
        });
    });

    it('says the goods are excluded, whether the lines are named or a whole order of them is withdrawn from', async () => {
        const named = await orderWithExcluded();
        const whole = await onlyExcludedOrder();
        const excludedMessage = 'Some of these goods are excluded from the right of withdrawal.';

        const byLine = await returnService.createReturn(
            {
                orderId: named.orderId,
                reason: 'withdrawal',
                lines: [{ productId: String(named.engraved._id), quantity: 1 }]
            },
            buyer(named.user),
            testCallerContext
        );
        const beforeDispatch = await returnService.createReturn(
            { orderId: whole.orderId, reason: 'withdrawal' },
            buyer(whole.user),
            testCallerContext
        );

        expect(!byLine.success && byLine.errors[0].message).toBe(excludedMessage);
        expect(!beforeDispatch.success && beforeDispatch.errors[0].message).toBe(excludedMessage);
    });
});

describe('what a new return leaves behind', () => {
    it('audits the request with its order and reason, for a return and for a withdrawal alike', async () => {
        const { user, orderId } = await deliveredOrder();
        const early = await orderIn(OrderStatus.paid);

        const shipped = await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );
        const withdrawn = await returnService.createReturn(
            { orderId: early.orderId, reason: 'withdrawal' },
            buyer(early.user),
            testCallerContext
        );

        if (!shipped.success || !withdrawn.success) throw new Error('expected two returns');
        expect(auditedAs(returnsAuditActions.RETURN_REQUESTED)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetType: 'return',
                targetId: String(shipped.data._id),
                metadata: { orderId, reason: 'defective' }
            }),
            expect.objectContaining({
                outcome: 'success',
                targetType: 'return',
                targetId: String(withdrawn.data._id),
                metadata: { orderId: early.orderId, reason: 'withdrawal' }
            })
        ]);
    });

    // The postage rule in force on the day the return opens is the one it keeps: a config change
    // later must not move who pays for an open return.
    it('freezes who pays the return postage when the return opens', async () => {
        const { user, orderId } = await deliveredOrder();

        setEnvironment({ NODE_RETURN_POSTAGE_PAYER: 'shop' });
        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );
        // The shop changes its mind afterwards: the open return keeps what it was opened under.
        setEnvironment({ NODE_RETURN_POSTAGE_PAYER: 'consumer' });

        if (!outcome.success) throw new Error('expected a return');
        expect(outcome.data.returnPostage).toBe('shop');
        const [stored] = await returnRepository.findByOrderId(orderId);
        expect(stored.returnPostage).toBe('shop');
    });

    // The order's return status is a report of a fact already decided: failing to write it never
    // takes the return back, and the next move stamps it.
    it('keeps the return when the report to the order fails', async () => {
        const { user, orderId } = await deliveredOrder();
        jest.spyOn(orderService, 'markReturnStatus').mockRejectedValueOnce(
            new Error('write failed')
        );

        const outcome = await returnService.createReturn(
            { orderId, reason: 'defective' },
            buyer(user),
            testCallerContext
        );

        expect(outcome.success).toBe(true);
        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(1);
    });

    it('mails a request without an address to send to, and a shipped withdrawal with one', async () => {
        const requested = await deliveredOrder();
        const withdrawing = await orderIn(OrderStatus.shipped);
        await setWithdrawUntil(withdrawing.orderId, new Date(Date.now() + 86_400_000));

        await returnService.createReturn(
            { orderId: requested.orderId, reason: 'defective' },
            buyer(requested.user),
            testCallerContext
        );
        await returnService.createReturn(
            { orderId: withdrawing.orderId, reason: 'withdrawal' },
            buyer(withdrawing.user),
            testCallerContext
        );
        await settleOutboxNudges();

        expect(mailSubject(0)).toBe('We received your return request');
        expect(mailData(0).address).toBeUndefined();
        expect(mailSubject(1)).toBe('We received your withdrawal');
        expect(mailData(1).address).toEqual(expect.stringContaining('Send the goods to:'));
    });

    it('answers a withdrawal before dispatch with the cancel refusal untouched when the order cannot be cancelled', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);
        jest.spyOn(orderService, 'withdrawById').mockResolvedValue(
            asStub<Awaited<ReturnType<typeof orderService.withdrawById>>>({
                success: false,
                status: 409,
                message: 'nope',
                errors: [{ message: 'cancel refused' }]
            })
        );

        const outcome = await returnService.createReturn(
            { orderId, reason: 'withdrawal' },
            buyer(user),
            testCallerContext
        );

        expect(!outcome.success && outcome.status).toBe(409);
        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(0);
    });
});

describe('what a decision leaves behind', () => {
    it('audits an approval and a decline under their own actions, naming the order', async () => {
        const approved = await requestedReturn();
        const declined = await requestedReturn();

        await returnService.approveReturn(approved.returnId, callerContextAs('admin'));
        await returnService.declineReturn(declined.returnId, 'Worn', callerContextAs('admin'));

        expect(auditedAs(returnsAuditActions.ADMIN_RETURN_APPROVED)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetType: 'return',
                targetId: approved.returnId,
                metadata: { orderId: approved.orderId }
            })
        ]);
        expect(auditedAs(returnsAuditActions.ADMIN_RETURN_DECLINED)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetType: 'return',
                targetId: declined.returnId,
                metadata: { orderId: declined.orderId }
            })
        ]);
    });

    it('tells the customer where to send the goods on an approval, and not on a decline', async () => {
        const approved = await requestedReturn();
        const declined = await requestedReturn();
        mockEnqueueEmail.mockClear();

        const approval = await returnService.approveReturn(
            approved.returnId,
            callerContextAs('admin')
        );
        const decline = await returnService.declineReturn(
            declined.returnId,
            'Worn',
            callerContextAs('admin')
        );
        await settleOutboxNudges();

        expect(mailSubject(0)).toBe('Your return was approved');
        expect(mailData(0).address).toEqual(expect.stringContaining('Send the goods to:'));
        expect(mailSubject(1)).toBe('Your return was declined');
        expect(mailData(1).address).toBeUndefined();
        expect(approval.success && approval.message).toBe('Return approved.');
        expect(decline.success && decline.message).toBe('Return declined.');
    });

    it('still decides when the order has vanished — the decision is never lost for want of a mail', async () => {
        const { returnId, orderId } = await requestedReturn();
        jest.spyOn(orderService, 'getById').mockResolvedValue(undefined);
        mockEnqueueEmail.mockClear();

        const result = await returnService.approveReturn(returnId, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('approved');
        expect(orderId).toBeTruthy();
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

describe('the account export, field by field', () => {
    it('carries the customer’s note and the moment the return was opened', async () => {
        const fixture = await deliveredOrder();
        await returnService.createReturn(
            { orderId: fixture.orderId, reason: 'defective', note: 'The handle snapped' },
            buyer(fixture.user),
            testCallerContext
        );

        const [section] = await collectPersonalData(fixture.user.id);

        expect(section.note).toBe('The handle snapped');
        expect(section.createdAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u));
    });

    it('omits the note when the customer wrote none', async () => {
        const fixture = await requestedReturn();

        const [section] = await collectPersonalData(fixture.user.id);

        expect(section).not.toHaveProperty('note');
    });
});

describe('the options read, by caller and deadline', () => {
    it('lists what the buyer can still return, with the reasons that are open', async () => {
        const { user, orderId } = await deliveredOrder();

        const options = await returnService.getReturnOptions(orderId, buyer(user));

        expect(options.success && options.data.reasons).toEqual([
            'withdrawal',
            'defective',
            'wrong_item',
            'other'
        ]);
        expect(options.success && options.data.returnable.length > 0).toBe(true);
    });

    it('offers staff nothing to return: the right is the buyer’s own', async () => {
        const { orderId } = await deliveredOrder();

        const options = await returnService.getReturnOptions(orderId, asAdmin());

        expect(options.success && options.data).toMatchObject({ reasons: [], returnable: [] });
    });

    it('narrows to the guarantee after the withdrawal period, made-to-order goods marked', async () => {
        const { user, engraved, orderId } = await orderWithExcluded();
        await setWithdrawUntil(orderId, new Date(Date.now() - 1000));

        const options = await returnService.getReturnOptions(orderId, buyer(user));

        expect(options.success && options.data.reasons).toEqual(['defective', 'wrong_item']);
        expect(
            options.success &&
                options.data.returnable.find((line) => line.productId === String(engraved._id))
        ).toMatchObject({ withdrawable: false });
    });

    it('hides excluded goods while only the withdrawal period is open', async () => {
        const { user, engraved, orderId } = await orderWithExcluded();
        await setConformityUntil(orderId, new Date(Date.now() - 1000));

        const options = await returnService.getReturnOptions(orderId, buyer(user));

        expect(options.success && options.data.reasons).toEqual(['withdrawal', 'other']);
        expect(
            options.success &&
                options.data.returnable.some((line) => line.productId === String(engraved._id))
        ).toBe(false);
    });

    it('is empty for the buyer once both deadlines are over', async () => {
        const { user, orderId } = await deliveredOrder();
        await setWithdrawUntil(orderId, new Date(Date.now() - 2000));
        await setConformityUntil(orderId, new Date(Date.now() - 1000));

        const options = await returnService.getReturnOptions(orderId, buyer(user));

        expect(options.success && options.data).toMatchObject({ reasons: [], returnable: [] });
    });
});
