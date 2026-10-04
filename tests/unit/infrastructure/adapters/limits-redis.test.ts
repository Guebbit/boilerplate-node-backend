/**
 * The `limits` Redis adapter: where counters and single-use claims live, on an instance of their
 * own. Three properties matter and are asserted here:
 *
 *   1. **No inheritance.** The URL is `NODE_RATE_LIMIT_REDIS_URL` and nothing else; the cache's
 *      Redis is never dialled for a claim, however it is configured.
 *   2. **A claim is exactly one `SET NX EX`**, namespaced under the limits prefix.
 *   3. **A failure never rejects.** Every claim function answers with its caller's safe fallback.
 *
 * The adapter memoises its client in module scope, so every case re-imports it.
 */

import { setEnvironment } from '@tests/environment';

const mockConnect = jest.fn();
const mockSendCommand = jest.fn();
const mockDestroy = jest.fn();
const mockClose = jest.fn();

const mockClient = {
    on: jest.fn(),
    connect: mockConnect,
    sendCommand: mockSendCommand,
    destroy: mockDestroy,
    close: mockClose,
    isReady: false
};

const mockCreateClient = jest.fn((_options: unknown) => mockClient);
jest.mock('redis', () => ({ createClient: (options: unknown) => mockCreateClient(options) }));

jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

/** Re-import the adapter with its memoised connection discarded. */
const freshLimits = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules demands a fresh synchronous require
    return require('@infrastructure/adapters/limits-redis') as typeof import('@infrastructure/adapters/limits-redis');
};

beforeEach(() => {
    mockConnect.mockImplementation(() => Promise.resolve());
    mockClose.mockImplementation(() => Promise.resolve());
    mockSendCommand.mockImplementation(() => Promise.resolve('OK'));
    setEnvironment({ NODE_RATE_LIMIT_REDIS_URL: 'redis://limits:6379' });
    setEnvironment({ NODE_RATE_LIMIT_REDIS_PREFIX: 'rate-limit' });
});

describe('limitsRedisUrl', () => {
    it('is the limits URL', () => {
        expect(freshLimits().limitsRedisUrl()).toBe('redis://limits:6379');
    });

    it('never falls back to the cache Redis', () => {
        setEnvironment({ NODE_RATE_LIMIT_REDIS_URL: undefined });
        setEnvironment({ NODE_REDIS_URL: 'redis://cache:6379' });
        setEnvironment({ NODE_REDIS_PORT: '6379' });

        expect(freshLimits().limitsRedisUrl()).toBeUndefined();
    });
});

describe('claimLimitsKey', () => {
    it('is one SET NX EX under the limits prefix, and says claimed for the winner', async () => {
        await expect(freshLimits().claimLimitsKey('antibot:spent:abc', 600)).resolves.toBe(
            'claimed'
        );

        expect(mockSendCommand).toHaveBeenCalledWith([
            'SET',
            'rate-limit:claim:antibot:spent:abc',
            '1',
            'NX',
            'EX',
            '600'
        ]);
    });

    it('says taken when NX found the key (a null reply)', async () => {
        mockSendCommand.mockImplementation(() => Promise.resolve(null));

        await expect(freshLimits().claimLimitsKey('k', 60)).resolves.toBe('taken');
    });

    it('says unavailable, without dialling anything, when no limits URL is set', async () => {
        setEnvironment({ NODE_RATE_LIMIT_REDIS_URL: undefined });

        await expect(freshLimits().claimLimitsKey('k', 60)).resolves.toBe('unavailable');
        expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('says unavailable instead of rejecting when Redis fails', async () => {
        mockSendCommand.mockImplementation(() => Promise.reject(new Error('ECONNRESET')));

        await expect(freshLimits().claimLimitsKey('k', 60)).resolves.toBe('unavailable');
        expect(mockDestroy).toHaveBeenCalled();
    });
});

describe('isLimitsKeyClaimed', () => {
    it('is a read-only EXISTS that never writes', async () => {
        mockSendCommand.mockImplementation(() => Promise.resolve(1));

        await expect(freshLimits().isLimitsKeyClaimed('k')).resolves.toBe(true);

        expect(mockSendCommand).toHaveBeenCalledTimes(1);
        expect(mockSendCommand).toHaveBeenCalledWith(['EXISTS', 'rate-limit:claim:k']);
    });

    it('is false for a key Redis does not hold', async () => {
        mockSendCommand.mockImplementation(() => Promise.resolve(0));

        await expect(freshLimits().isLimitsKeyClaimed('k')).resolves.toBe(false);
    });

    it('is false with no limits URL, and false rather than rejecting on a failure', async () => {
        mockSendCommand.mockImplementation(() => Promise.reject(new Error('timeout')));
        await expect(freshLimits().isLimitsKeyClaimed('k')).resolves.toBe(false);

        setEnvironment({ NODE_RATE_LIMIT_REDIS_URL: undefined });
        await expect(freshLimits().isLimitsKeyClaimed('k')).resolves.toBe(false);
    });
});
