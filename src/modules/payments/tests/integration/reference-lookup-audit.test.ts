/**
 * @module
 * `GET /payments/order-by-reference` hands staff a whole order, so a lookup is an audited read of
 * it, recorded under the order's id.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { auditLogger } from '@infrastructure/adapters/logger';
import { transferOrder } from '../factories';

setupTestDb();

describe('GET /payments/order-by-reference', () => {
    it('records the lookup under the order it returned', async () => {
        const { user } = await authenticateAs('user');
        const { bearer } = await authenticateAs('admin');
        const { order, reference } = await transferOrder({ user });
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
        ).toEqual([String(order._id)]);
        auditSpy.mockRestore();
    });
});
