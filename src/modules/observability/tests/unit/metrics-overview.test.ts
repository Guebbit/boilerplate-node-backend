/**
 * @module
 * `GET /observability/metrics/overview` — that the domain rows carry real numbers. The controller
 * resolves each counter by metric NAME off the shared prom registry rather than importing
 * `account`/`cart`/`orders` directly, so a renamed metric or an unregistered module both silently
 * degrade to zero and nothing else would notice. Hence one test per wired row, incrementing the
 * real counter; the absent-counter path is asserted too, since that's what a deleted module leaves.
 */

import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import { counter, runOverview } from './metrics-overview.support';

/*
 * Loading the MANIFESTS, not the counters.
 *
 * A counter registers itself on the shared registry when its module's `metrics.ts` is first
 * imported, and importing a manifest pulls its routes → controllers → metrics. That is enough to
 * put the real counters on the registry without this spec ever naming another module's internals —
 * which is the same boundary the controller under test respects, and the reason it can survive a
 * domain being deleted.
 */
import '@modules/account/module';

jest.mock('@infrastructure/http/response', () => ({
    __esModule: true,
    successResponse: jest.fn(),
    rejectResponse: jest.fn()
}));

describe('observability metrics overview', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reports login successes and failures from the account module counter', async () => {
        const before = await runOverview();

        counter('auth_login_total').inc({ status: 'success' }, 2);
        counter('auth_login_total').inc({ status: 'failure' }, 3);

        const after = await runOverview();
        expect(after.auth.loginSuccess).toBe(before.auth.loginSuccess + 2);
        expect(after.auth.loginFailure).toBe(before.auth.loginFailure + 3);
    });

    it('reports signups from the account module counter', async () => {
        const before = await runOverview();
        counter('auth_signup_total').inc({ status: 'success' }, 1);

        const after = await runOverview();
        expect(after.auth.signupSuccess).toBe(before.auth.signupSuccess + 1);
    });

    it('reports database query and error totals from the persistence layer counters', async () => {
        const before = await runOverview();

        counter('db_queries_total').inc(7);
        counter('db_errors_total').inc(2);

        const after = await runOverview();
        expect(after.database.queriesTotal).toBe(before.database.queriesTotal + 7);
        expect(after.database.errorsTotal).toBe(before.database.errorsTotal + 2);
    });

    it('leaves the business block out when no shop module registered a metric', async () => {
        // A foundation-only build: every counter behind the block is gone, so zeros would claim
        // figures nobody is measuring. `business` is optional in `openapi.yaml` for this case.
        const names = [
            'cart_checkout_total',
            'order_created_total',
            'products_low_stock_total',
            'inventory_reserved_units_total'
        ];
        const removed = names.flatMap((name) => metricsRegistry.getSingleMetric(name) ?? []);
        for (const name of names) metricsRegistry.removeSingleMetric(name);

        const after = await runOverview();
        expect(after).not.toHaveProperty('business');
        expect(after.auth).toBeDefined();

        // Put them back: the registry is process-global and later suites read the same instance.
        for (const metric of removed) metricsRegistry.registerMetric(metric);
    });
});
