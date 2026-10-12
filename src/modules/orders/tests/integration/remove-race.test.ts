/**
 * @module
 * A hard delete racing a settlement or a reopen. `remove` reads `status` and `paidAt` on the
 * document it was handed, so a change that commits after that read must still stop the delete:
 * the write itself is conditional on the order being cancelled and unpaid, and a miss is
 * answered from a fresh read. Real Mongo.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asReject } from '@tests/response';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    toOrderItem,
    markOrderPaidAt,
    readOrder
} from '@modules/orders/tests/factories';
import { remove } from '../../services/remove';

setupTestDb();

/** A cancelled, unpaid order, read the way `removeById` reads it. */
const cancelledOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ onHand: 10 });
    const created = await createOrder(user, [toOrderItem(product, 3)], { status: 'cancelled' });
    const orderId = String(created._id);
    const order = await readOrder(orderId);
    if (!order) throw new Error('order vanished');
    return { order, orderId };
};

describe('remove: a hard delete', () => {
    it('refuses with 409 ORDER_INVOICED when a settlement commits between the read and the delete', async () => {
        const { order, orderId } = await cancelledOrder();
        // The order in hand still says unpaid; the settlement lands behind its back.
        await markOrderPaidAt(orderId, new Date());

        const result = await remove(order, true);

        expect(asReject(result)).toMatchObject({ status: 409 });
        expect(asReject(result).errors[0].code).toBe('ORDER_INVOICED');
        expect(await readOrder(orderId)).not.toBeNull();
    });

    it('refuses with 409 ORDER_NOT_CANCELLED when the order is reopened between the read and the delete', async () => {
        const { order, orderId } = await cancelledOrder();
        await forceOrderStatus(orderId, 'pending');

        const result = await remove(order, true);

        expect(asReject(result).errors[0].code).toBe('ORDER_NOT_CANCELLED');
        expect(await readOrder(orderId)).not.toBeNull();
    });

    it('answers 404 when the order is deleted between the read and the delete', async () => {
        const { order, orderId } = await cancelledOrder();
        await remove(await readOrder(orderId).then((current) => current!), true);

        const result = await remove(order, true);

        expect(asReject(result).status).toBe(404);
    });

    it('deletes a cancelled, unpaid order', async () => {
        const { order, orderId } = await cancelledOrder();

        const result = await remove(order, true);

        expect(result.success).toBe(true);
        expect(await readOrder(orderId)).toBeNull();
    });
});
