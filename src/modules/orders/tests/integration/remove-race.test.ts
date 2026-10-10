/**
 * @module
 * A hard delete racing a settlement. `remove` reads `paidAt` on the document it was handed, so a
 * payment that commits after that read must still stop the delete: the write itself is conditional
 * on the order being unpaid, and the stock release rolls back with a refused delete. Real Mongo.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import {
    createOrder,
    toOrderItem,
    markOrderPaidAt,
    readOrder
} from '@modules/orders/tests/factories';
import { inventoryService } from '@modules/inventory';
import { remove } from '../../services/remove';

setupTestDb();

/** An unpaid order whose 3 units are held, read the way `removeById` reads it. */
const heldUnpaidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ onHand: 10 });
    const created = await createOrder(user, [toOrderItem(product, 3)]);
    const orderId = String(created._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(product._id), quantity: 3 }
    ]);
    const order = await readOrder(orderId);
    if (!order) throw new Error('order vanished');
    return { order, orderId, productId: String(product._id) };
};

describe('remove — a hard delete', () => {
    it('refuses with 409 when a settlement commits between the read and the delete', async () => {
        const { order, orderId, productId } = await heldUnpaidOrder();
        // The order in hand still says unpaid; the settlement lands behind its back.
        await markOrderPaidAt(orderId, new Date());

        const result = await remove(order, true);

        expect(result).toMatchObject({ success: false, status: 409 });
        expect(await readOrder(orderId)).not.toBeNull();
        // The release rolled back with the refused delete: the units are still held.
        expect(await countersOf(productId)).toMatchObject({ onHand: 10, reserved: 3 });
    });

    it('still deletes an unpaid order and gives its units back', async () => {
        const { order, orderId, productId } = await heldUnpaidOrder();

        const result = await remove(order, true);

        expect(result.success).toBe(true);
        expect(await readOrder(orderId)).toBeNull();
        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 0, available: 10 });
    });
});
