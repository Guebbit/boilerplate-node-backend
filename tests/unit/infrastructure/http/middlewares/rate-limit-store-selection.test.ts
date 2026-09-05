/**
 * `rateLimitStore` — which store a limiter counts in, and everything that follows from Redis
 * being lazy, shared, and allowed to fail.
 *
 * Sibling to `rate-limit-store.test.ts`, deliberately kept separate: that file lets the real
 * `RedisStore` run against a fake low-level `redis` client to guard the `connecting`-promise
 * handshake race. This one mocks `RedisStore` itself, because what is under test here — which
 * store gets built, URL-resolution priority, lazy construction, the missing-config alert, and the
 * init-failure regression below — needs to control `RedisStore.init`/`increment` directly rather
 * than drive them through a real Lua-script-loading round trip. One `jest.mock('rate-limit-redis')`
 * per file, so the two approaches cannot live together in one.
 *
 * `client`/`connecting`/`degraded` are module-scope state, so every case re-imports the module
 * fresh via `jest.resetModules()` + `require()` — the same pattern `cache.test.ts` uses for the
 * same reason.
 *
 * The test suite's own `tests/support/setup.ts` sets `NODE_RATE_LIMIT_REDIS_ENABLED ??= '0'`
 * globally, so every case that means to exercise the Redis path re-enables it explicitly.
 */
// Also forces module scope for this file — otherwise its top-level `const`s collide, at the type
// checker, with the identically-named ones in cache.test.ts's own copy of the same pattern.
import type { Options } from 'express-rate-limit';

const ORIGINAL_ENVIRONMENT = {
    NODE_RATE_LIMIT_REDIS_ENABLED: process.env.NODE_RATE_LIMIT_REDIS_ENABLED,
    NODE_RATE_LIMIT_REDIS_URL: process.env.NODE_RATE_LIMIT_REDIS_URL,
    NODE_REDIS_URL: process.env.NODE_REDIS_URL,
    NODE_REDIS_HOST: process.env.NODE_REDIS_HOST,
    NODE_REDIS_PORT: process.env.NODE_REDIS_PORT,
    NODE_CLUSTER_WORKERS: process.env.NODE_CLUSTER_WORKERS
};

afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENVIRONMENT)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

const mockSelectionOn = jest.fn();
const mockSelectionConnect = jest.fn();
const mockSelectionSendCommand = jest.fn();
const mockSelectionDestroy = jest.fn();
const mockSelectionQuit = jest.fn();

const mockSelectionClient = {
    on: mockSelectionOn,
    connect: mockSelectionConnect,
    sendCommand: mockSelectionSendCommand,
    destroy: mockSelectionDestroy,
    quit: mockSelectionQuit,
    isReady: false
};

const mockCreateClient = jest.fn((_options: unknown) => mockSelectionClient);
jest.mock('redis', () => ({ createClient: (options: unknown) => mockCreateClient(options) }));

/** `RedisStore.init` awaits two Lua-script loads internally — see the fix under test below. */
const mockInit = jest.fn();
const mockIncrement = jest.fn();
const mockConstruct = jest.fn();

/*
 * `increment` calls `this.sendCommand(...)` — the real `RedisStore` does the same to run its Lua
 * script — so the mock still exercises `send()`/`build()`/`createClient` the way production does,
 * rather than short-circuiting the whole chain this file exists to test.
 */
class MockRedisStore {
    sendCommand: (...command: string[]) => Promise<unknown>;

    constructor(options: {
        prefix: string;
        sendCommand: (...command: string[]) => Promise<unknown>;
    }) {
        mockConstruct(options);
        this.sendCommand = options.sendCommand;
    }

    init = mockInit;
    increment = (key: string) => {
        mockIncrement(key);
        return this.sendCommand('INCR', key);
    };
}

jest.mock('rate-limit-redis', () => ({ RedisStore: MockRedisStore }));

jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

/** Re-import with module-scope state (`client`, `connecting`, `degraded`) discarded. */
const freshStore = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules demands a fresh synchronous require
    return require('@infrastructure/http/middlewares/rate-limit-store') as typeof import('@infrastructure/http/middlewares/rate-limit-store');
};

/* eslint-disable @typescript-eslint/no-require-imports -- jest.resetModules demands a fresh synchronous require */
const freshLogger = () => {
    const loggerModule =
        require('@infrastructure/adapters/logger') as typeof import('@infrastructure/adapters/logger');
    return loggerModule.logger;
};
/* eslint-enable @typescript-eslint/no-require-imports -- back to normal for the rest of the file */

/*
 * `express-rate-limit` is not mocked, so `jest.resetModules()` also gives it a fresh module
 * instance — an `instanceof MemoryStore` check against the top-level import would compare across
 * two different copies of the class and always fail. Re-requiring it fresh, the same reason as
 * the logger above, keeps the check comparing the SAME copy `rateLimitStore()` actually used.
 */
const freshMemoryStore = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules demands a fresh synchronous require
    return (require('express-rate-limit') as typeof import('express-rate-limit')).MemoryStore;
};

beforeEach(() => {
    mockSelectionConnect.mockImplementation(() => Promise.resolve());
    mockInit.mockImplementation(() => Promise.resolve());
    // A real Redis answers `INCR` with an integer; the exact value is irrelevant to every case
    // here, which asserts on whether/how the chain was called, not on a counter value.
    mockSelectionSendCommand.mockImplementation(() => Promise.resolve(1));
});

describe('rateLimitStore — which store gets built', () => {
    it('returns an in-process MemoryStore when the Redis kill switch is off', () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '0';
        process.env.NODE_REDIS_URL = 'redis://redis:6379';

        const rateLimitStore = freshStore();
        const store = rateLimitStore.rateLimitStore('global');

        expect(store).toBeInstanceOf(freshMemoryStore());
        expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('returns MemoryStore when Redis is enabled but nothing configures a URL', () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
        delete process.env.NODE_RATE_LIMIT_REDIS_URL;
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_PORT;

        const rateLimitStore = freshStore();
        const store = rateLimitStore.rateLimitStore('global');

        expect(store).toBeInstanceOf(freshMemoryStore());
    });

    it('does not build a RedisStore until something is actually counted', () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
        process.env.NODE_REDIS_URL = 'redis://redis:6379';

        freshStore().rateLimitStore('global');

        expect(mockCreateClient).not.toHaveBeenCalled();
        expect(mockInit).not.toHaveBeenCalled();
    });

    it('builds the RedisStore on the first increment, once, and memoises it', async () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
        process.env.NODE_REDIS_URL = 'redis://redis:6379';
        const store = freshStore().rateLimitStore('global');

        await store.increment('key-a');
        await store.increment('key-b');

        expect(mockCreateClient).toHaveBeenCalledTimes(1);
        expect(mockIncrement).toHaveBeenCalledTimes(2);
    });

    it('namespaces the RedisStore prefix per limiter, so budgets cannot cross', async () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
        process.env.NODE_REDIS_URL = 'redis://redis:6379';
        const store = freshStore().rateLimitStore('credentials-identity');

        await store.increment('key-a');

        expect(mockConstruct).toHaveBeenCalledWith(
            expect.objectContaining({ prefix: 'rate-limit:credentials-identity:' })
        );
    });
});

describe('rateLimitStore — the missing-config alert', () => {
    it('logs when no Redis is configured and more than one worker is running', () => {
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_PORT;
        process.env.NODE_CLUSTER_WORKERS = '4';

        freshStore().rateLimitStore('global');

        expect(freshLogger().error).toHaveBeenCalledWith(
            expect.objectContaining({ namespace: 'global' })
        );
    });

    it('stays quiet when a single worker makes per-process counting correct anyway', () => {
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_PORT;
        process.env.NODE_CLUSTER_WORKERS = '1';

        freshStore().rateLimitStore('global');

        expect(freshLogger().error).not.toHaveBeenCalled();
    });
});

const urlUsedFor = async (): Promise<string> => {
    process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
    const store = freshStore().rateLimitStore('global');
    await store.increment('key');
    return (mockCreateClient.mock.calls.at(-1)?.[0] as { url: string }).url;
};

describe('rateLimitStore — URL resolution priority', () => {
    it('prefers NODE_RATE_LIMIT_REDIS_URL over every other source', async () => {
        process.env.NODE_RATE_LIMIT_REDIS_URL = 'redis://limiter-only:6379';
        process.env.NODE_REDIS_URL = 'redis://shared:6379';

        await expect(urlUsedFor()).resolves.toBe('redis://limiter-only:6379');
    });

    it('falls back to NODE_REDIS_URL when the limiter has no URL of its own', async () => {
        delete process.env.NODE_RATE_LIMIT_REDIS_URL;
        process.env.NODE_REDIS_URL = 'redis://shared:6379';

        await expect(urlUsedFor()).resolves.toBe('redis://shared:6379');
    });

    it('assembles a URL from host and port as the last resort, defaulting the host', async () => {
        delete process.env.NODE_RATE_LIMIT_REDIS_URL;
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_HOST;
        process.env.NODE_REDIS_PORT = '6380';

        await expect(urlUsedFor()).resolves.toBe('redis://127.0.0.1:6380');
    });
});

describe('rateLimitStore — an init failure fails open instead of crashing (regression)', () => {
    /*
     * The bug this guards: `lazyRedisStore` used to fire `inner.init(options)` with no `.catch()`.
     * `RedisStore.init()` awaits two Lua-script loads, so any failure there — Redis unreachable, or
     * a reply `rate-limit-redis` does not recognise — rejected a promise nothing was holding. An
     * unhandled rejection is fatal by default since Node 15: the whole process would go down on a
     * Redis hiccup, which is exactly the outage `send()` is written to fail open from instead.
     */
    it('logs the failure and lets the request proceed rather than throwing', async () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
        process.env.NODE_REDIS_URL = 'redis://redis:6379';
        mockInit.mockRejectedValue(new TypeError('unexpected reply from redis client'));
        const store = freshStore().rateLimitStore('global');
        // `express-rate-limit` calls this on the real Store before any request ever increments it —
        // it is what makes `options` truthy, and so what makes `store()` call `inner.init(options)`
        // at all. Skipping it would test a path the middleware never actually leaves untaken.
        void store.init?.({ windowMs: 60_000 } as Options);

        // The regression itself: this must resolve, not crash the process, even though init()
        // above is rejecting on this exact tick.
        await expect(store.increment('key')).resolves.toBeDefined();

        // Give the fire-and-forgotten init().catch() a turn to run before asserting on it.
        await Promise.resolve();
        await Promise.resolve();

        expect(freshLogger().error).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('failed to initialise')
            })
        );
    });
});

describe('stopRateLimitStore', () => {
    it('resolves without touching Redis when no client was ever built', async () => {
        await expect(freshStore().stopRateLimitStore()).resolves.toBeUndefined();
        expect(mockSelectionQuit).not.toHaveBeenCalled();
    });

    it('quits the client that was actually built', async () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
        process.env.NODE_REDIS_URL = 'redis://redis:6379';
        mockSelectionQuit.mockImplementation(() => Promise.resolve());
        const rateLimitStore = freshStore();
        await rateLimitStore.rateLimitStore('global').increment('key');

        await rateLimitStore.stopRateLimitStore();

        expect(mockSelectionQuit).toHaveBeenCalledTimes(1);
        expect(mockSelectionDestroy).not.toHaveBeenCalled();
    });

    it('destroys the socket when QUIT itself fails, rather than hanging on shutdown', async () => {
        process.env.NODE_RATE_LIMIT_REDIS_ENABLED = '1';
        process.env.NODE_REDIS_URL = 'redis://redis:6379';
        mockSelectionQuit.mockImplementation(() => Promise.reject(new Error('socket closed')));
        const rateLimitStore = freshStore();
        await rateLimitStore.rateLimitStore('global').increment('key');

        await expect(rateLimitStore.stopRateLimitStore()).resolves.toBeUndefined();

        expect(mockSelectionDestroy).toHaveBeenCalledTimes(1);
    });
});
