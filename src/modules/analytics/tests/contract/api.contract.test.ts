/**
 * @module
 * Contract tests for `POST /analytics/events`: the two events in the contract answer `204`, and
 * anything outside the closed set answers `422`.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';

setupTestDb();

describe('POST /analytics/events', () => {
    it('accepts a product view with 204', async () => {
        const response = await api()
            .post('/analytics/events')
            .send({ event: 'product_viewed', productId: 'abc123' });

        expect(response.status).toBe(204);
    });

    it('accepts a search with 204', async () => {
        const response = await api()
            .post('/analytics/events')
            .send({ event: 'products_searched', text: 'lamp', resultCount: 3, page: 1 });

        expect(response.status).toBe(204);
    });

    it('refuses an event outside the closed set with 422', async () => {
        const response = await api().post('/analytics/events').send({ event: 'order_created' });

        expect(response.status).toBe(422);
    });
});
