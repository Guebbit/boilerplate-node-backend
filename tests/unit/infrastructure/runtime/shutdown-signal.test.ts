/**
 * The shutdown signal's path: what happens at the signal, in what order, and what a second signal
 * does. Every adapter is stubbed; the clock is faked, so the delay and the forced-exit deadline
 * are exact.
 */
import { createShutdownHandler, SHUTDOWN_SHARES } from '@infrastructure/runtime/server-lifecycle';
import { stopConsuming } from '@infrastructure/adapters/queue';
import { markServerDraining } from '@infrastructure/runtime/readiness';
import { setEnvironment } from '@tests/environment';

jest.mock('@infrastructure/adapters/queue', () => ({
    __esModule: true,
    stopQueue: jest.fn(),
    stopConsuming: jest.fn()
}));
jest.mock('@infrastructure/runtime/readiness', () => ({
    __esModule: true,
    markServerDraining: jest.fn()
}));
jest.mock('@infrastructure/runtime/database', () => ({
    __esModule: true,
    stopDatabase: jest.fn()
}));
jest.mock('@infrastructure/adapters/cache', () => ({ __esModule: true, stopCache: jest.fn() }));
jest.mock('@infrastructure/adapters/pdf', () => ({ __esModule: true, settleRenders: jest.fn() }));
jest.mock('@infrastructure/http/middlewares/idempotency', () => ({
    __esModule: true,
    settleIdempotencyMarks: jest.fn()
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

/** The lame-duck delay and teardown budget every case below runs with, ms. */
const DELAY_MS = 5000;

/** The teardown budget, ms. */
const TIMEOUT_MS = 10_000;

/** What happened, in order, across the stubs under watch. */
let calls: string[];

/** `process.exit`, replaced so a case can read how it was called. */
let exit: jest.SpyInstance;

beforeEach(() => {
    jest.useFakeTimers();
    calls = [];
    setEnvironment({
        NODE_SHUTDOWN_DELAY_MS: String(DELAY_MS),
        NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS: String(TIMEOUT_MS)
    });
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    jest.mocked(markServerDraining).mockImplementation(() => {
        calls.push('draining');
    });
    jest.mocked(stopConsuming).mockImplementation(() => {
        calls.push('consumers cancelled');
        return Promise.resolve();
    });
});

afterEach(() => {
    exit.mockRestore();
    jest.useRealTimers();
});

/** A teardown that records itself and resolves. */
const recordingStop = () =>
    jest.fn(() => {
        calls.push('stopped');
        return Promise.resolve();
    });

describe('SHUTDOWN_SHARES', () => {
    it('leaves part of the budget for the stores that close after the steps', () => {
        const total = Object.values(SHUTDOWN_SHARES).reduce((sum, share) => sum + share, 0);

        expect(total).toBeLessThan(1);
    });
});

describe('createShutdownHandler', () => {
    it('goes unready and stops taking jobs at the signal, and tears down only after the delay', async () => {
        const stop = recordingStop();
        createShutdownHandler(stop)('SIGTERM');

        await jest.advanceTimersByTimeAsync(DELAY_MS - 1);
        expect(calls).toEqual(['draining', 'consumers cancelled']);

        await jest.advanceTimersByTimeAsync(1);
        expect(calls).toEqual(['draining', 'consumers cancelled', 'stopped']);
    });

    it('exits 0 once the teardown completes', async () => {
        createShutdownHandler(recordingStop())('SIGTERM');

        await jest.advanceTimersByTimeAsync(DELAY_MS);

        expect(exit).toHaveBeenCalledWith(0);
    });

    it('starts the teardown on the next tick when no delay is set', async () => {
        setEnvironment({ NODE_SHUTDOWN_DELAY_MS: '0' });
        const stop = recordingStop();
        createShutdownHandler(stop)('SIGINT');

        await jest.advanceTimersByTimeAsync(0);

        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('ignores a second signal: one teardown, however many arrive', async () => {
        const stop = recordingStop();
        const handler = createShutdownHandler(stop);

        handler('SIGTERM');
        handler('SIGINT');
        handler('SIGTERM');
        await jest.advanceTimersByTimeAsync(DELAY_MS);

        expect(stop).toHaveBeenCalledTimes(1);
        expect(markServerDraining).toHaveBeenCalledTimes(1);
        expect(stopConsuming).toHaveBeenCalledTimes(1);
    });

    it('forces a non-zero exit at delay + budget when the teardown never ends', async () => {
        createShutdownHandler(() => new Promise<void>(() => undefined))('SIGTERM');

        await jest.advanceTimersByTimeAsync(DELAY_MS + TIMEOUT_MS - 1);
        expect(exit).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1);
        expect(exit).toHaveBeenCalledWith(1);
    });

    it('exits 1 when the teardown fails', async () => {
        createShutdownHandler(() => Promise.reject(new Error('close failed')))('SIGTERM');

        await jest.advanceTimersByTimeAsync(DELAY_MS);

        expect(exit).toHaveBeenCalledWith(1);
        expect(exit).not.toHaveBeenCalledWith(0);
    });
});
