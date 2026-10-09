/**
 * @module
 * The relay's one promise: nothing reaches the analytics provider before the visitor consents,
 * and the answer is the same `204` either way. Driven through the real app, with the resolved
 * provider's `capture` spied on.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setEnvironment } from '@tests/environment';
import {
    resetAnalyticsProvider,
    resolveAnalyticsProvider
} from '@infrastructure/observability/analytics';

setupTestDb();

/** What the provider was asked to capture. */
let capture: jest.SpyInstance;

beforeEach(() => {
    setEnvironment({ NODE_ANALYTICS_PROVIDER: 'none' });
    setEnvironment({ NODE_ANALYTICS_REQUIRE_CONSENT: 'true' });
    resetAnalyticsProvider();
    capture = jest.spyOn(resolveAnalyticsProvider(), 'capture');
});

afterEach(() => {
    jest.restoreAllMocks();
    resetAnalyticsProvider();
});

describe('POST /analytics/events', () => {
    const VIEW = { event: 'product_viewed', productId: 'abc123' };

    it('answers 204 and captures nothing without consent', async () => {
        const response = await api().post('/analytics/events').send(VIEW);

        expect(response.status).toBe(204);
        expect(capture).not.toHaveBeenCalled();
    });

    it('captures a product view once the visitor has consented', async () => {
        const response = await api()
            .post('/analytics/events')
            .set('X-Analytics-Consent', 'true')
            .send(VIEW);

        expect(response.status).toBe(204);
        expect(capture).toHaveBeenCalledTimes(1);
        expect(capture).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'product_viewed',
                properties: { product_id: 'abc123' }
            })
        );
    });

    it('captures a search with its term, page and result count', async () => {
        await api()
            .post('/analytics/events')
            .set('X-Analytics-Consent', 'true')
            .send({ event: 'products_searched', text: 'lamp', resultCount: 3, page: 2 });

        expect(capture).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'products_searched',
                properties: { text: 'lamp', page: 2, result_count: 3 }
            })
        );
    });

    it('refuses an event name outside the closed set, consent or not', async () => {
        const response = await api()
            .post('/analytics/events')
            .set('X-Analytics-Consent', 'true')
            .send({ event: 'order_created' });

        expect(response.status).toBe(422);
        expect(capture).not.toHaveBeenCalled();
    });

    it('refuses an event with an unknown extra field', async () => {
        const response = await api()
            .post('/analytics/events')
            .set('X-Analytics-Consent', 'true')
            .send({ ...VIEW, email: 'ada@example.com' });

        expect(response.status).toBe(422);
    });
});
