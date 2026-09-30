/**
 * @module
 * `GET /observability/metrics/overview`'s `business` block — the counters the shop modules own.
 * Apart from the rest of the overview suite so removing the shop takes exactly this file with it.
 */

import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import { counter, runOverview } from './metrics-overview.support';

/* Loading the MANIFESTS puts the shop's real counters on the shared registry; see metrics-overview.test.ts. */
import '@modules/cart/module';
import '@modules/orders/module';

jest.mock('@infrastructure/http/response', () => ({
    __esModule: true,
    successResponse: jest.fn(),
    rejectResponse: jest.fn()
}));

describe('observability metrics overview — the shop block', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reports checkouts from the cart module counter', async () => {
        const before = await runOverview();
        counter('cart_checkout_total').inc({ status: 'success' }, 4);

        const after = await runOverview();
        expect(after.business?.checkoutSuccess).toBe((before.business?.checkoutSuccess ?? 0) + 4);
    });

    it('reports created orders from the orders module counter', async () => {
        const before = await runOverview();
        counter('order_created_total').inc(5);

        const after = await runOverview();
        expect(after.business?.ordersCreated).toBe((before.business?.ordersCreated ?? 0) + 5);
    });

    it('reports zero for a counter no enabled module registered', async () => {
        // What a deleted module leaves behind. `metricsRegistry.getSingleMetric` returns undefined
        // and the row has to degrade to 0 while the rest of the shop block is still reported.
        const removed = metricsRegistry.getSingleMetric('cart_checkout_total');
        metricsRegistry.removeSingleMetric('cart_checkout_total');

        const after = await runOverview();
        expect(after.business?.checkoutSuccess).toBe(0);

        // Put it back: the registry is process-global and later suites read the same instance.
        if (removed) metricsRegistry.registerMetric(removed);
    });
});
