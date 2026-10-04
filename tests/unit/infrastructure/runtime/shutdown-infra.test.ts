/**
 * `shutdownInfra` — the order the stores close in. Every adapter is stubbed: what is under test is
 * the sequence, which a real adapter would only hide.
 */
import { shutdownInfra } from '@infrastructure/runtime/server-lifecycle';
import { stopQueue } from '@infrastructure/adapters/queue';
import { stopDatabase } from '@infrastructure/runtime/database';

jest.mock('@infrastructure/adapters/queue', () => ({ __esModule: true, stopQueue: jest.fn() }));
jest.mock('@infrastructure/runtime/database', () => ({
    __esModule: true,
    stopDatabase: jest.fn()
}));
jest.mock('@infrastructure/adapters/cache', () => ({ __esModule: true, stopCache: jest.fn() }));
jest.mock('@infrastructure/adapters/pdf', () => ({
    __esModule: true,
    settleRenders: jest.fn(() => Promise.resolve())
}));
jest.mock('@infrastructure/adapters/limits-redis', () => ({
    __esModule: true,
    stopLimitsRedis: jest.fn()
}));
jest.mock('@infrastructure/i18n', () => ({
    __esModule: true,
    stopLocaleOverrideRefresh: jest.fn()
}));
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    shutdownAnalytics: jest.fn()
}));
jest.mock('@infrastructure/runtime/otel-sdk', () => ({
    __esModule: true,
    shutdownTracing: jest.fn()
}));

/** What happened, in order, across the stubs under watch. */
let calls: string[];

beforeEach(() => {
    calls = [];
    jest.mocked(stopQueue).mockImplementation(() => {
        calls.push('queue stopped');
        return Promise.resolve();
    });
    jest.mocked(stopDatabase).mockImplementation(() => {
        calls.push('database stopped');
        return Promise.resolve();
    });
});

describe('shutdownInfra', () => {
    it("lets the caller's in-flight work finish before the queue and the database close", async () => {
        const settleInFlight = jest.fn(
            () =>
                new Promise<void>((resolve) =>
                    setTimeout(() => {
                        calls.push('in-flight settled');
                        resolve();
                    }, 10)
                )
        );

        await shutdownInfra(undefined, settleInFlight);

        expect(calls).toEqual(['in-flight settled', 'queue stopped', 'database stopped']);
        expect(settleInFlight).toHaveBeenCalledWith(expect.any(Number));
    });

    it('closes the stores as before when there is no in-flight work to settle', async () => {
        await shutdownInfra();

        expect(calls).toEqual(['queue stopped', 'database stopped']);
    });
});
