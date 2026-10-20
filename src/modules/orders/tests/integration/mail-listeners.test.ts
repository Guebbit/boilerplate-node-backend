/**
 * @module
 * The buyer's mails are sent from this module's listeners on `order.created` and
 * `order.cancelled` (`docs/tools/outbox.md#customer-mail`): the event alone is enough to send,
 * the cause on the cancel picks the mail, a mail that fails never fails the act, and every cancel
 * door names its cause on the row it writes.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { asAdmin, asCustomer, testCallerContext } from '@tests/callers';
import { MISSING_ID } from '@tests/ids';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';
import { orderService } from '../../services';
import { ORDER_CANCELLED, ORDER_CREATED } from '../../events';
import type { CancelCause } from '../../services/cancel';
import ordersModule from '../../module';
import { cancelForErasureById } from '../../services/cancel';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockClear();
    registerModules([ordersModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** An order for one product, optionally paid by `paymentMethod`. */
const seedOrder = async (paymentMethod: 'card' | 'bank_transfer' = 'card') => {
    const user = await createUser();
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], { paymentMethod });
    return { user, order, orderId: String(order._id) };
};

/** The templates queued so far, in order. */
const templates = () => mockEnqueueEmail.mock.calls.map(([, template]) => template);

describe('order.created sends the placed-order mail', () => {
    it('mails the buyer from the event alone', async () => {
        const { order, orderId } = await seedOrder();

        await emitDomainEvent(ORDER_CREATED, { orderId });

        expect(templates()).toEqual(['orders.order-confirm']);
        expect(mockEnqueueEmail.mock.calls[0][0].to).toBe(order.email);
    });

    it('sends nothing, and does not reject, for an order that is gone', async () => {
        await expect(
            orderService.mailOrderPlaced({ orderId: MISSING_ID })
        ).resolves.toBeUndefined();

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('does not reject when the mail cannot be queued', async () => {
        const { orderId } = await seedOrder();
        const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        mockEnqueueEmail.mockImplementationOnce(() => {
            throw new Error('queue down');
        });

        await expect(orderService.mailOrderPlaced({ orderId })).resolves.toBeUndefined();

        expect(logged).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'mailBuyer: sending the buyer mail failed.' })
        );
    });
});

describe('order.cancelled sends the mail its cause picks', () => {
    it.each<[CancelCause, 'card' | 'bank_transfer', string[]]>([
        ['customer', 'card', ['orders.order-cancelled']],
        ['operator', 'bank_transfer', ['orders.order-cancelled']],
        ['reservation_expired', 'card', ['orders.order-card-expired']],
        // A transfer nobody sent is answered by `payments`.
        ['reservation_expired', 'bank_transfer', []],
        ['withdrawal', 'card', []],
        ['erasure', 'card', []],
        ['payment_mismatch', 'card', []]
    ])('cause %s on a %s order sends %j', async (cause, paymentMethod, expected) => {
        const { orderId } = await seedOrder(paymentMethod);

        await emitDomainEvent(ORDER_CANCELLED, { orderId, refund: true, cause });

        expect(templates()).toEqual(expected);
    });

    it('does not reject when the mail cannot be queued', async () => {
        const { orderId } = await seedOrder();
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
        mockEnqueueEmail.mockImplementationOnce(() => {
            throw new Error('queue down');
        });

        await expect(
            orderService.mailOrderCancelled({ orderId, refund: true, cause: 'customer' })
        ).resolves.toBeUndefined();
    });

    it('still cancels when the mail fails: the act does not wait on it', async () => {
        const { user, orderId } = await seedOrder();
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
        mockEnqueueEmail.mockImplementation(() => {
            throw new Error('queue down');
        });

        const result = await orderService.cancelOnRequestById(
            orderId,
            asCustomer(user.id),
            {},
            testCallerContext
        );
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        expect(await outboxEventModel.countDocuments({ name: ORDER_CANCELLED })).toBe(1);
    });
});

describe('every cancel door names its cause on the row it writes', () => {
    it.each<[CancelCause, (orderId: string, userId: string) => Promise<unknown>]>([
        ['customer', (id, user) => orderService.cancelOnRequestById(id, asCustomer(user))],
        ['operator', (id) => orderService.cancelOnRequestById(id, asAdmin())],
        ['withdrawal', (id, user) => orderService.withdrawById(id, asCustomer(user))],
        ['reservation_expired', (id) => orderService.expireReservationById(id)],
        ['erasure', (id) => cancelForErasureById(id)],
        ['payment_mismatch', (id) => orderService.cancelForPaymentMismatchById(id)]
    ])('%s', async (cause, cancel) => {
        const { user, orderId } = await seedOrder();

        await cancel(orderId, user.id);

        const [row] = await outboxEventModel.find({ name: ORDER_CANCELLED }).lean();
        expect(row.payload).toMatchObject({ orderId, cause });
    });
});
