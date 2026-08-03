/**
 * Cache adapter — two things the seeding/cache tooling depends on.
 *
 * 1. TTL clamping (PROPOSAL §9, option C). Cache invalidation only fires for writes that go
 *    through the API, so anything writing straight to Mongo (`db:seed`, migrations, `mongosh`)
 *    leaves stale answers behind until they expire. Outside production the declared TTL is
 *    clamped so that window is seconds, not an hour.
 * 2. `clearCache`'s reachability reporting (PROPOSAL §15, option B). It still fails open, but
 *    it now distinguishes "nothing to clear" from "could not clear" so `db:cache:clear` can
 *    exit non-zero instead of announcing a success it did not achieve.
 *
 * `resolveCacheTtl` reads `process.env` on every call, so the module does not need re-importing
 * between cases — but NODE_ENV has to be restored, since jest sets it to 'test' globally.
 * The `clearCache` block below *does* re-import, because the adapter memoises its Redis client
 * in module scope.
 */
import { resolveCacheTtl } from '@core/adapters/cache';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_TTL_MAX = process.env.NODE_REDIS_CACHE_DEV_TTL_MAX;
const ORIGINAL_REDIS_URL = process.env.NODE_REDIS_URL;
const ORIGINAL_CACHE_ENABLED = process.env.NODE_REDIS_CACHE_ENABLED;

const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
};

afterEach(() => {
    restore('NODE_ENV', ORIGINAL_NODE_ENV);
    restore('NODE_REDIS_CACHE_DEV_TTL_MAX', ORIGINAL_TTL_MAX);
    restore('NODE_REDIS_URL', ORIGINAL_REDIS_URL);
    restore('NODE_REDIS_CACHE_ENABLED', ORIGINAL_CACHE_ENABLED);
});

describe('resolveCacheTtl', () => {
    it('leaves the declared TTL alone in production', () => {
        process.env.NODE_ENV = 'production';

        expect(resolveCacheTtl(3600)).toBe(3600);
    });

    it('clamps long TTLs to the 30s default outside production', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.NODE_REDIS_CACHE_DEV_TTL_MAX;

        expect(resolveCacheTtl(3600)).toBe(30);
    });

    it('leaves TTLs already below the ceiling untouched', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.NODE_REDIS_CACHE_DEV_TTL_MAX;

        expect(resolveCacheTtl(10)).toBe(10);
    });

    it('honours a custom ceiling', () => {
        process.env.NODE_ENV = 'development';
        process.env.NODE_REDIS_CACHE_DEV_TTL_MAX = '5';

        expect(resolveCacheTtl(3600)).toBe(5);
    });

    it('treats 0 as "no cap" rather than "never cache"', () => {
        process.env.NODE_ENV = 'development';
        process.env.NODE_REDIS_CACHE_DEV_TTL_MAX = '0';

        expect(resolveCacheTtl(3600)).toBe(3600);
    });

    it('falls back to the default when the ceiling is not a usable number', () => {
        process.env.NODE_ENV = 'development';

        for (const value of ['not-a-number', '-1', '']) {
            process.env.NODE_REDIS_CACHE_DEV_TTL_MAX = value;
            expect(resolveCacheTtl(3600)).toBe(30);
        }
    });
});

// ─── clearCache: "nothing to clear" vs "could not clear" ──────────────────────

const mockOn = jest.fn();
const mockConnect = jest.fn();
const mockScanIterator = jest.fn();
const mockDel = jest.fn();

const mockClient = {
    on: mockOn,
    connect: mockConnect,
    scanIterator: mockScanIterator,
    del: mockDel,
    quit: jest.fn(),
    disconnect: jest.fn(),
    // `getClient` short-circuits on `isReady`; keeping it false forces the connect path, which
    // is where the reachable/unreachable distinction is actually decided.
    isReady: false,
    isOpen: false
};

jest.mock('redis', () => ({ createClient: () => mockClient }));

// The adapter logs a warning on every unreachable path; silence it so a passing run is quiet.
jest.mock('@core/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

/**
 * Re-import the adapter with module state discarded.
 *
 * `client` and `connectPromise` are module-level, so a second case would otherwise reuse the
 * first case's connection verdict.
 */
const freshCache = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@core/adapters/cache') as typeof import('@core/adapters/cache');
};

/** Turn a list of key batches into the async iterable node-redis' `scanIterator` returns. */
const scanBatches = (batches: string[][]) =>
    (async function* () {
        for (const batch of batches) yield batch;
    })();

describe('clearCache', () => {
    beforeEach(() => {
        // `clearMocks: true` wipes implementations between cases, so re-arm the happy path.
        mockConnect.mockImplementation(() => Promise.resolve());
        mockDel.mockImplementation((keys: string[]) => Promise.resolve(keys.length));
        mockScanIterator.mockReturnValue(scanBatches([]));
    });

    it('reports reachable with a count when Redis answers', async () => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockScanIterator.mockReturnValue(scanBatches([['a', 'b'], [], ['c']]));

        await expect(freshCache().clearCache()).resolves.toEqual({ deleted: 3, reachable: true });
    });

    it('reports reachable when caching is switched off — there is nothing to go stale', async () => {
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_PORT;

        await expect(freshCache().clearCache()).resolves.toEqual({ deleted: 0, reachable: true });
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('honours the NODE_REDIS_CACHE_ENABLED=0 kill switch the same way', async () => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        process.env.NODE_REDIS_CACHE_ENABLED = '0';

        await expect(freshCache().clearCache()).resolves.toEqual({ deleted: 0, reachable: true });
        expect(mockConnect).not.toHaveBeenCalled();
    });

    /*
     * The regression this whole change exists for. `getClient()` reports a failed connect by
     * resolving void — the same value it uses for "caching is off" — so before §15 both landed
     * on `return 0` and `db:cache:clear` printed "0 keys removed" and exited 0 with a full cache.
     */
    it('reports UNREACHABLE when caching is on but Redis refuses the connection', async () => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(freshCache().clearCache()).resolves.toEqual({ deleted: 0, reachable: false });
    });

    it('reports unreachable when the connection dies mid-scan', async () => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockScanIterator.mockImplementation(() => {
            throw new Error('socket closed');
        });

        await expect(freshCache().clearCache()).resolves.toEqual({ deleted: 0, reachable: false });
    });

    it('never rejects, so callers choose whether to fail open', async () => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(freshCache().clearCache()).resolves.toBeDefined();
    });
});
