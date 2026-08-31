/**
 * @module
 * `GET /observability/metrics/overview` — that the domain rows carry real numbers.
 *
 * This exists because of how the endpoint reaches those numbers. The counters belong to `account`,
 * `cart` and `orders`; importing them here would give `observability` a dependency on three
 * domains and make deleting any of them a compile error in the one module whose job is to outlive
 * them. So the controller resolves each counter by metric NAME off the shared prom registry.
 *
 * That indirection is untyped by construction — a renamed metric, or a module whose `metrics.ts`
 * is never imported and therefore never registers, both degrade to "counter absent" and report
 * zero. Nothing else in the suite would notice: the only other coverage is a smoke test asserting
 * the endpoint returns 200, which it does just as happily with every row zeroed.
 *
 * Hence one test per wired row, each incrementing the real counter and reading the real registry.
 * The absent-counter path is asserted too, because that is the state every deleted module leaves
 * behind and it must stay a zero rather than a crash.
 */

import { asStub } from '@tests/stub';
import { getObservabilityMetricsOverview } from '@modules/observability/controllers/get-observability-metrics-overview';
import { successResponse } from '@infrastructure/http/response';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

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
import '@modules/cart/module';
import '@modules/orders/module';

jest.mock('@infrastructure/http/response', () => ({
    __esModule: true,
    successResponse: jest.fn(),
    rejectResponse: jest.fn()
}));

/** Shape of the payload the controller hands to `successResponse` — the subset this suite asserts on. */
interface Overview {
    auth: { loginSuccess: number; loginFailure: number; signupSuccess: number };
    business: { checkoutSuccess: number; ordersCreated: number };
    database: { queriesTotal: number; errorsTotal: number };
}

/**
 * A registered counter, resolved by metric NAME exactly as the controller resolves it.
 *
 * Typed loosely on purpose: `getSingleMetric` returns the registry's `Metric` union, and narrowing
 * it back to `Counter` would mean asserting the very thing the lookup is here to leave open.
 */
const counter = (name: string) =>
    asStub<{
        inc: (labelsOrValue?: Record<string, string> | number, value?: number) => void;
    }>(metricsRegistry.getSingleMetric(name));

/** Run the controller and return the payload it handed to `successResponse`. */
const runOverview = async (): Promise<Overview> => {
    await getObservabilityMetricsOverview({} as never, {} as never);
    const { calls } = (successResponse as jest.Mock).mock;
    return calls.at(-1)?.[1] as Overview;
};

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

    it('reports checkouts from the cart module counter', async () => {
        const before = await runOverview();
        counter('cart_checkout_total').inc({ status: 'success' }, 4);

        const after = await runOverview();
        expect(after.business.checkoutSuccess).toBe(before.business.checkoutSuccess + 4);
    });

    it('reports created orders from the orders module counter', async () => {
        const before = await runOverview();
        counter('order_created_total').inc(5);

        const after = await runOverview();
        expect(after.business.ordersCreated).toBe(before.business.ordersCreated + 5);
    });

    it('reports database query and error totals from the persistence layer counters', async () => {
        const before = await runOverview();

        counter('db_queries_total').inc(7);
        counter('db_errors_total').inc(2);

        const after = await runOverview();
        expect(after.database.queriesTotal).toBe(before.database.queriesTotal + 7);
        expect(after.database.errorsTotal).toBe(before.database.errorsTotal + 2);
    });

    it('reports zero for a counter no enabled module registered', async () => {
        // What a deleted module leaves behind. `metricsRegistry.getSingleMetric` returns undefined
        // and the row has to degrade to 0 — the response shape is fixed by `openapi.yaml`, so a
        // client must not be able to tell which modules this build has.
        const removed = metricsRegistry.getSingleMetric('cart_checkout_total');
        metricsRegistry.removeSingleMetric('cart_checkout_total');

        const after = await runOverview();
        expect(after.business.checkoutSuccess).toBe(0);

        // Put it back: the registry is process-global and later suites read the same instance.
        if (removed) metricsRegistry.registerMetric(removed);
    });
});
