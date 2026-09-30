/**
 * @module
 * What the metrics-overview suites share: reading a counter by name, and running the controller.
 * The suite that imports this mocks `@infrastructure/http/response` itself — `jest.mock` is
 * per test file and hoists there.
 */

import { asStub } from '@tests/stub';
import { getObservabilityMetricsOverview } from '@modules/observability/controllers/get-observability-metrics-overview';
import { successResponse } from '@infrastructure/http/response';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';

/** Shape of the payload the controller hands to `successResponse` — the subset this suite asserts on. */
export interface Overview {
    auth: { loginSuccess: number; loginFailure: number; signupSuccess: number };
    business?: { checkoutSuccess: number; ordersCreated: number };
    database: { queriesTotal: number; errorsTotal: number };
}

/**
 * A registered counter, resolved by metric NAME exactly as the controller resolves it.
 *
 * Typed loosely on purpose: `getSingleMetric` returns the registry's `Metric` union, and narrowing
 * it back to `Counter` would mean asserting the very thing the lookup is here to leave open.
 */
export const counter = (name: string) =>
    asStub<{
        inc: (labelsOrValue?: Record<string, string> | number, value?: number) => void;
    }>(metricsRegistry.getSingleMetric(name));

/** Run the controller and return the payload it handed to `successResponse`. */
export const runOverview = async (): Promise<Overview> => {
    await getObservabilityMetricsOverview({} as never, {} as never);
    const { calls } = (successResponse as jest.Mock).mock;
    return calls.at(-1)?.[1] as Overview;
};
