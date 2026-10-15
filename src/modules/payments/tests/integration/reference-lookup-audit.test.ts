/**
 * @module
 * `GET /payments/order-by-reference` hands staff a whole order, so a lookup is an audited read of
 * it, recorded under the order's id.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { auditLogger } from '@infrastructure/adapters/logger';
import { buildReference } from '@modules/orders';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

setupTestDb();

describe('GET /payments/order-by-reference', () => {
    it('records the lookup under the order it returned', async () => {
        const { user } = await authenticateAs('user');
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ price: 20 });
        const id = new Types.ObjectId();
        const reference = buildReference(id.toHexString());
        await createOrder(user, [toOrderItem(product, 1)], {
            id: id.toHexString(),
            paymentMethod: 'bank_transfer',
            transferReference: reference
        });
        const auditSpy = jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);

        const response = await api()
            .get('/payments/order-by-reference')
            .query({ ref: reference })
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(
            auditSpy.mock.calls
                .map((call) => call[2] as { action?: string; targetId?: string })
                .filter((entry) => entry.action === 'admin.order.looked_up')
                .map((entry) => entry.targetId)
        ).toEqual([id.toHexString()]);
        auditSpy.mockRestore();
    });
});
