/**
 * @module
 * The per-order reads of the return repository against a real database: oldest first, whatever
 * order the rows were written in, and a read inside a transaction sees that transaction's own
 * uncommitted write.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { withTransaction } from '@infrastructure/runtime/database';
import { OrderStatus } from '@types';
import { returnModel } from '../../model';
import type { ReturnReason } from '../../domain';
import { returnRepository } from '../../repository';

setupTestDb();

/** One order with one product, and a function that writes a return on it created at a given time. */
const orderWithWriter = async () => {
    const user = await createUser({ email: 'repository-reads@example.com' });
    const product = await createProduct({ title: 'Shirt', price: 30 });
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.delivered
    });
    const write = (reason: ReturnReason, createdAt?: Date) =>
        returnModel.create({
            orderId: order._id,
            orderNumber: order.orderNumber ?? 'N-1',
            currency: 'EUR',
            status: 'requested',
            reason,
            lines: [{ productId: product._id, quantity: 1, title: 'Shirt', unitPrice: 30 }],
            returnPostage: 'consumer',
            ...(createdAt ? { createdAt } : {})
        });
    return { orderId: String(order._id), write };
};

describe('reading returns by order', () => {
    it('lists one order’s returns oldest first, whatever order they were written in', async () => {
        const { orderId, write } = await orderWithWriter();
        await write('defective', new Date('2031-01-03T00:00:00.000Z'));
        await write('other', new Date('2031-01-01T00:00:00.000Z'));
        await write('wrong_item', new Date('2031-01-02T00:00:00.000Z'));

        const listed = await returnRepository.findByOrderId(orderId);

        expect(listed.map(({ reason }) => reason)).toEqual(['other', 'wrong_item', 'defective']);
    });

    it('lists many orders’ returns oldest first too, for the account export', async () => {
        const { orderId, write } = await orderWithWriter();
        await write('defective', new Date('2031-01-03T00:00:00.000Z'));
        await write('other', new Date('2031-01-01T00:00:00.000Z'));

        const listed = await returnRepository.findByOrderIds([orderId]);

        expect(listed.map(({ reason }) => reason)).toEqual(['other', 'defective']);
    });

    it('sees, inside a transaction, a return that transaction has written and not yet committed', async () => {
        const { orderId } = await orderWithWriter();
        const seen = await withTransaction(async (session) => {
            const [created] = await returnModel.create(
                [
                    {
                        orderId,
                        orderNumber: 'N-1',
                        currency: 'EUR',
                        status: 'requested',
                        reason: 'defective',
                        lines: [],
                        returnPostage: 'consumer'
                    }
                ],
                { session }
            );
            return returnRepository
                .findByOrderId(orderId, session)
                .then((rows) => [created, rows.length] as const);
        });

        expect(seen[1]).toBe(1);
        expect(await returnRepository.findByOrderId(orderId)).toHaveLength(1);
    });
});
