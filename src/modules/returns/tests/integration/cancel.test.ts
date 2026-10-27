/**
 * @module
 * Canceling an approved return whose goods never came: `approved → canceled`, bookkeeping only. It
 * holds no units, counts as no goods back, and moves no money, no stock, no event and no mail.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { resetDomainEvents } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { asReject } from '@tests/response';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, readOrder, timelineOf, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { inventoryService } from '@modules/inventory';
import { paymentService } from '@modules/payments';
import paymentsModule from '@modules/payments/module';
import returnsModule from '../../module';
import { returnService } from '../../services';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

/** The audit rows written since the test began. */
let audited: AuditEntry[] = [];

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
    audited = [];
    registerAuditSink((entry) => audited.push(entry));
    mockEnqueueEmail.mockClear();
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A distinct address per customer. */
let customers = 0;

/** Two shirts (30.00) and a mug (10.00), paid by card, delivered; stock held and sold for real. */
const paidAndDelivered = async () => {
    customers += 1;
    const user = await createUser({ email: `cancel-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: 10, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)]);
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
    await carryOrderTo(orderId, 'delivered');
    return { user, shirt, mug, orderId };
};

type Fixture = Awaited<ReturnType<typeof paidAndDelivered>>;

/** Open a return on the fixture and, unless it is a withdrawal, approve it. */
const openedReturn = async (
    fixture: Fixture,
    reason: 'withdrawal' | 'defective' = 'defective',
    approve = true
) => {
    const outcome = await returnService.createReturn(
        { orderId: fixture.orderId, reason },
        asCustomer(fixture.user.id),
        callerContextAs('customer', fixture.user.id)
    );
    if (!outcome.success) throw new Error('expected a return');
    const id = String(outcome.data._id);
    if (reason !== 'withdrawal' && approve)
        await returnService.approveReturn(id, callerContextAs('admin'));
    // The acknowledgement and decision mails and events are setup: let them land.
    await settleOutboxNudges();
    mockEnqueueEmail.mockClear();
    return id;
};

/** The refunds on an order's payment. */
const refundsOf = async (orderId: string) => {
    const read = await paymentService.getForOrder(orderId, asAdmin());
    if (!read.success) throw new Error('no payment');
    return read.data.refunds;
};

describe('canceling an approved return', () => {
    it('moves it to canceled, writes the audit with the note and one timeline row, and no more', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        audited = [];

        const result = await returnService.cancelReturn(
            id,
            'the buyer never sent it',
            callerContextAs('admin')
        );

        expect(result.success && result.data.status).toBe('canceled');
        expect(result.success && result.data.canceledAt).toBeInstanceOf(Date);
        expect(audited.filter(({ action }) => action === 'admin.return.canceled')).toEqual([
            expect.objectContaining({
                targetType: 'return',
                targetId: id,
                metadata: { orderId: fixture.orderId, note: 'the buyer never sent it' }
            })
        ]);
        const rows = await timelineOf(fixture.orderId, 'return_canceled');
        expect(rows).toHaveLength(1);
        // The note is staff-only: it never rides the order's timeline.
        expect(JSON.stringify(rows[0])).not.toContain('never sent');
    });

    it('moves no money, no stock, publishes no event and mails nobody', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        const refundsBefore = await refundsOf(fixture.orderId);
        const shirtBefore = await countersOf(fixture.shirt._id);
        const eventsBefore = await outboxEventModel.countDocuments({});

        await returnService.cancelReturn(id, undefined, callerContextAs('admin'));
        await settleOutboxNudges();

        expect(await refundsOf(fixture.orderId)).toHaveLength(refundsBefore.length);
        expect(await countersOf(fixture.shirt._id)).toEqual(shirtBefore);
        expect(await outboxEventModel.countDocuments({})).toBe(eventsBefore);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('takes no note, and leaves the order’s return status', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        const before = await readOrder(fixture.orderId);
        expect(before?.toJSON().returnStatus).toBe('in_progress');

        const result = await returnService.cancelReturn(id, undefined, callerContextAs('admin'));

        expect(result.success).toBe(true);
        const after = await readOrder(fixture.orderId);
        expect(after?.toJSON().returnStatus).toBe('none');
        const row = audited.find(({ action }) => action === 'admin.return.canceled');
        expect(row?.metadata).not.toHaveProperty('note');
    });

    it('frees the same lines: a new return takes the units the canceled one held', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        const buyer = asCustomer(fixture.user.id);
        const held = await returnService.getReturnOptions(fixture.orderId, buyer);
        expect(held.success && held.data.returnable).toEqual([]);

        await returnService.cancelReturn(id, undefined, callerContextAs('admin'));

        const freed = await returnService.getReturnOptions(fixture.orderId, buyer);
        expect(freed.success && freed.data.returnable.map(({ quantity }) => quantity)).toEqual([
            2, 1
        ]);
        const again = await returnService.createReturn(
            { orderId: fixture.orderId, reason: 'defective' },
            buyer,
            callerContextAs('customer', fixture.user.id)
        );
        expect(again.success && again.data.lines).toHaveLength(2);
    });

    it('cancels a withdrawal, which is born approved', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture, 'withdrawal');

        const result = await returnService.cancelReturn(id, undefined, callerContextAs('admin'));

        expect(result.success && result.data.status).toBe('canceled');
    });

    it('offers the cancel to a staff member holding update:Return, only on an approved return', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);

        const before = await returnService.getReturn(id, asAdmin());
        expect(before.success && before.data.actions.cancel).toBe(true);
        await returnService.cancelReturn(id, undefined, callerContextAs('admin'));
        const after = await returnService.getReturn(id, asAdmin());
        expect(after.success && after.data.actions.cancel).toBe(false);
    });
});

describe('what cannot be canceled', () => {
    it('answers 409 RETURN_NOT_CANCELABLE to a second cancel and writes nothing more', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        await returnService.cancelReturn(id, undefined, callerContextAs('admin'));
        audited = [];

        const second = await returnService.cancelReturn(id, 'x', callerContextAs('admin'));

        expect(asReject(second).status).toBe(409);
        expect(asReject(second).errors[0].code).toBe('RETURN_NOT_CANCELABLE');
        expect(audited).toHaveLength(0);
        expect(await timelineOf(fixture.orderId, 'return_canceled')).toHaveLength(1);
    });

    it('refuses a requested return: that one is declined, not canceled', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture, 'defective', false);

        const result = await returnService.cancelReturn(id, undefined, callerContextAs('admin'));

        expect(asReject(result).errors[0].code).toBe('RETURN_NOT_CANCELABLE');
    });

    it('refuses a received return and a closed one', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        await returnService.receiveReturn(id, {}, callerContextAs('admin'));

        const closed = await returnService.cancelReturn(id, undefined, callerContextAs('admin'));

        expect(asReject(closed).errors[0].code).toBe('RETURN_NOT_CANCELABLE');
    });

    it('refuses a declined return', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture, 'defective', false);
        await returnService.declineReturn(
            id,
            { reason: 'return_period_ended' },
            callerContextAs('admin')
        );

        const result = await returnService.cancelReturn(id, undefined, callerContextAs('admin'));

        expect(asReject(result).errors[0].code).toBe('RETURN_NOT_CANCELABLE');
    });

    it('answers 404 for a return that does not exist', async () => {
        const result = await returnService.cancelReturn(
            '64b64b64b64b64b64b64b64b',
            undefined,
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(404);
    });
});

describe('after a cancel', () => {
    it('refuses to receive the goods, and to close by hand', async () => {
        const fixture = await paidAndDelivered();
        const id = await openedReturn(fixture);
        await returnService.cancelReturn(id, undefined, callerContextAs('admin'));

        const received = await returnService.receiveReturn(id, {}, callerContextAs('admin'));
        const closed = await returnService.closeReturnByHand(
            id,
            undefined,
            callerContextAs('admin')
        );

        expect(asReject(received).errors[0].code).toBe('RETURN_NOT_RECEIVABLE');
        expect(asReject(closed).errors[0].code).toBe('RETURN_NOT_CLOSABLE');
        expect(await refundsOf(fixture.orderId)).toHaveLength(0);
    });
});
