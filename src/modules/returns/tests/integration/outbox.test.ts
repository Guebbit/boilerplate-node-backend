/**
 * @module
 * The return events ride the transactional outbox: each row commits with the write it announces
 * or not at all, is keyed on the order so one order's events stay in order, and reaches the bus
 * (and so the webhook fan-out) through the relay. Real Mongo. See docs/tools/outbox.md.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, setWithdrawUntil, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { onDomainEvent } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { OrderStatus } from '@types';
import paymentsModule from '@modules/payments/module';
import returnsModule from '../../module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext, callerContextAs } from '@tests/callers';
import { approveReturn, createReturn, receiveReturn } from '../../services';
import { closeReturn } from '../../services/close';
import { RETURN_CLOSED, RETURN_RECEIVED, RETURN_REQUESTED } from '../../events';
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
    jest.restoreAllMocks();
});

/** A distinct address per customer. */
let customers = 0;

/** A customer with a two-shirt order, forced to `status`, inside its withdrawal window. */
const orderIn = async (status: OrderStatus) => {
    customers += 1;
    const user = await createUser({ email: `outbox-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30 });
    const carried = status === OrderStatus.shipped || status === OrderStatus.delivered;
    const order = await createOrder(user, [toOrderItem(shirt, 2)], {
        status: carried ? OrderStatus.processing : status
    });
    const orderId = String(order._id);
    // Goods that arrived got there through the real doors, so the shipments exist.
    if (carried) await carryOrderTo(orderId, status);
    await setWithdrawUntil(orderId, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    return { user, shirt, orderId };
};

/** The outbox rows of the three return events, oldest first. */
const returnRows = () =>
    outboxEventModel
        .find({ name: { $in: [RETURN_REQUESTED, RETURN_RECEIVED, RETURN_CLOSED] } })
        .sort({ _id: 1 })
        .lean()
        .exec();

/** Opens a defective-goods return on a delivered order, approved and ready to receive. */
const approvedReturn = async () => {
    const { user, orderId } = await orderIn(OrderStatus.delivered);
    const outcome = await createReturn(
        { orderId, reason: 'defective' },
        asCustomer(user.id),
        testCallerContext
    );
    if (outcome.kind !== 'created') throw new Error('expected a return');
    const id = String(outcome.created._id);
    await approveReturn(id, callerContextAs('admin'));
    return { id, orderId };
};

describe('return.requested', () => {
    it('is written with the return, keyed on the order, and delivered by the relay', async () => {
        const { user, orderId } = await orderIn(OrderStatus.delivered);
        const heard: unknown[] = [];
        onDomainEvent(
            RETURN_REQUESTED,
            (payload, meta) => void heard.push([payload, meta.eventId])
        );

        const outcome = await createReturn(
            { orderId, reason: 'defective' },
            asCustomer(user.id),
            testCallerContext
        );
        await settleOutboxNudges();

        if (outcome.kind !== 'created') throw new Error('expected a return');
        const rows = await returnRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            name: RETURN_REQUESTED,
            aggregateId: orderId,
            status: 'published'
        });
        expect(heard).toEqual([
            [
                { returnId: String(outcome.created._id), orderId, reason: 'defective' },
                String(rows[0]?._id)
            ]
        ]);
    });

    it('leaves no return behind when its event cannot be written', async () => {
        const { user, orderId } = await orderIn(OrderStatus.delivered);
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(
            createReturn({ orderId, reason: 'defective' }, asCustomer(user.id), testCallerContext)
        ).rejects.toThrow('disk full');

        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(0);
        expect(await returnRows()).toHaveLength(0);
    });
});

describe('a withdrawal before dispatch', () => {
    it('writes requested then closed, one row each, both keyed on the order', async () => {
        const { user, orderId } = await orderIn(OrderStatus.paid);

        await createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );
        await settleOutboxNudges();

        const rows = await returnRows();
        expect(rows.map((row) => [row.name, row.aggregateId, row.status])).toEqual([
            [RETURN_REQUESTED, orderId, 'published'],
            [RETURN_CLOSED, orderId, 'published']
        ]);
    });
});

describe('return.received and return.closed', () => {
    it('receiving writes received with the restock, then closed once the money is settled', async () => {
        const { id, orderId } = await approvedReturn();

        const result = await receiveReturn(id, {}, callerContextAs('admin'));
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        const rows = await returnRows();
        expect(rows.map((row) => [row.name, row.aggregateId])).toEqual([
            [RETURN_REQUESTED, orderId],
            [RETURN_RECEIVED, orderId],
            [RETURN_CLOSED, orderId]
        ]);
        expect(rows.every((row) => row.status === 'published')).toBe(true);
    });

    it('leaves the return approved and writes no received row when the event cannot be written', async () => {
        const { id } = await approvedReturn();
        await settleOutboxNudges();
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(receiveReturn(id, {}, callerContextAs('admin'))).rejects.toThrow('disk full');

        const stored = await returnRepository.findById(id);
        expect(stored?.status).toBe('approved');
        expect(await outboxEventModel.countDocuments({ name: RETURN_RECEIVED }).exec()).toBe(0);
    });

    it('closing twice announces once', async () => {
        const { id } = await approvedReturn();
        await receiveReturn(id, {}, callerContextAs('admin'));
        await settleOutboxNudges();

        await expect(closeReturn(id)).resolves.toBeNull();
        await settleOutboxNudges();

        expect(await outboxEventModel.countDocuments({ name: RETURN_CLOSED }).exec()).toBe(1);
    });
});
