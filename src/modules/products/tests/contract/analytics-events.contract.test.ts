/**
 * @module
 * Contract tests for `POST /analytics/events`: the two events `products` declares answer `204`,
 * and anything outside the closed set answers `422`. They live here because the closed set is the
 * deployed modules' events: with none declared, the contract keeps one open `event` name.
 *
 * @see docs/modules/analytics.md#the-story
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';

setupTestDb();

describe('POST /analytics/events', () => {
    it('accepts a product view with 204', async () => {
        const response = await api()
            .post('/analytics/events')
            .send({ event: 'product_viewed', productId: '65a1b2c3d4e5f60718293a4b' });

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
