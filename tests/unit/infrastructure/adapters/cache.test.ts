/**
 * Cache adapter — the byte store the caching middleware is built on.
 *
 * Two properties run through everything below and are worth naming once:
 *
 *   1. **Fail open.** A cache is an optimisation, never a dependency. Every path here must
 *      resolve — never reject — when Redis is unreachable, slow, or returns nonsense, because a
 *      rejection becomes a 500 on a request that could have been served from Mongo.
 *   2. **Prefixing.** Every key is namespaced. Two deployments sharing a Redis (staging and
 *      production, the classic accident) must not read each other's entries, and the prefix is the
 *      only thing preventing it.
 *
 * `clearCache` gets its own block because it is the one function that does NOT collapse the two
 * fail-open cases: `db:cache:clear` has to tell "nothing to clear" from "could not clear" so it
 * can exit non-zero instead of announcing a success it did not achieve.
 *
 * What this file no longer tests, because the adapter no longer decides it: the TTL clamp, the
 * per-entry byte limit and the response envelope live with their only consumer, in
 * `tests/unit/infrastructure/http/middlewares/cache.test.ts`.
 *
 * The blocks below re-import the adapter, because it memoises its Redis client in module scope.
 */

const ORIGINAL_ENVIRONMENT = {
    NODE_REDIS_URL: process.env.NODE_REDIS_URL,
    NODE_REDIS_HOST: process.env.NODE_REDIS_HOST,
    NODE_REDIS_PORT: process.env.NODE_REDIS_PORT,
    NODE_REDIS_CACHE_ENABLED: process.env.NODE_REDIS_CACHE_ENABLED
};

afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENVIRONMENT)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

// ─── clearCache: "nothing to clear" vs "could not clear" ──────────────────────

const mockOn = jest.fn();
const mockConnect = jest.fn();
const mockScanIterator = jest.fn();
const mockDel = jest.fn();
const mockSet = jest.fn();
const mockSAdd = jest.fn();
const mockGet = jest.fn();
const mockSMembers = jest.fn();

const mockQuit = jest.fn();
const mockDestroy = jest.fn();

const mockClient = {
    on: mockOn,
    connect: mockConnect,
    scanIterator: mockScanIterator,
    del: mockDel,
    set: mockSet,
    sAdd: mockSAdd,
    get: mockGet,
    sMembers: mockSMembers,
    quit: mockQuit,
    destroy: mockDestroy,
    // The lifecycle short-circuits on `isReady`; keeping it false forces the connect path, which
    // is where the reachable/unreachable distinction is actually decided.
    isReady: false,
    isOpen: false
};

const mockCreateClient = jest.fn((_options: unknown) => mockClient);

jest.mock('redis', () => ({ createClient: (options: unknown) => mockCreateClient(options) }));

// The adapter logs a warning on every unreachable path; silence it so a passing run is quiet.
jest.mock('@infrastructure/adapters/logger', () => ({
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules demands a fresh synchronous require
    return require('@infrastructure/adapters/cache') as typeof import('@infrastructure/adapters/cache');
};

/** Turn a list of key batches into the async iterable node-redis' `scanIterator` returns. */
const scanBatches = (batches: string[][]) =>
    // eslint-disable-next-line @typescript-eslint/require-await -- the async wrapper is the contract: node-redis' scanIterator is an AsyncIterable
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
     * `getClient()` reports a failed connect by resolving void — the same value it uses for
     * "caching is off" — so collapsing the two would have `db:cache:clear` print "0 keys removed"
     * and exit 0 with a full cache.
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

// ─── The read/write/invalidate path ──────────────────────────────────────────
/**
 * The three functions the caching middleware actually calls, and the reason they had no tests:
 * they need a Redis, and the unit suite has none. Every one of their branches was reported as
 * "no coverage" — not weak assertions, no execution at all — which is why the file sat at 48%.
 */
describe('getCacheValue', () => {
    beforeEach(() => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockConnect.mockImplementation(() => Promise.resolve());
    });

    it('returns the stored bytes on a hit, exactly as they were written', async () => {
        // Opaque to the adapter: whatever the caller serialized comes back verbatim, and only the
        // caller knows how to read it.
        mockGet.mockImplementation(() => Promise.resolve('{"status":201,"body":{"id":"7"}}'));

        const value = await freshCache().getCacheValue('GET:/products');

        expect(value).toBe('{"status":201,"body":{"id":"7"}}');
    });

    it('reads a namespaced key, so two deployments cannot share entries', async () => {
        mockGet.mockImplementation(() => Promise.resolve());

        await freshCache().getCacheValue('GET:/products');

        expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(':key:GET:/products'));
        expect(mockGet).not.toHaveBeenCalledWith('key:GET:/products');
    });

    it('resolves undefined on a miss', async () => {
        // node-redis answers `null` for an absent or expired key.
        mockGet.mockImplementation(() => Promise.resolve(null));

        await expect(freshCache().getCacheValue('GET:/products')).resolves.toBeUndefined();
    });

    it('resolves undefined when Redis itself fails', async () => {
        mockGet.mockImplementation(() => Promise.reject(new Error('connection reset')));

        await expect(freshCache().getCacheValue('GET:/products')).resolves.toBeUndefined();
    });

    it('resolves undefined when caching is switched off, without connecting', async () => {
        // Both routes to a URL — the explicit one and the host/port fallback — or `getRedisUrl`
        // still resolves one from a loaded `.env`, as it did under the mutation runner.
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_PORT;

        await expect(freshCache().getCacheValue('GET:/products')).resolves.toBeUndefined();
        expect(mockConnect).not.toHaveBeenCalled();
    });
});

describe('setCacheValue tag index', () => {
    beforeEach(() => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockConnect.mockImplementation(() => Promise.resolve());
        mockSet.mockImplementation(() => Promise.resolve('OK'));
        mockSAdd.mockImplementation(() => Promise.resolve(1));
    });

    it('stores the bytes with the TTL as an expiry Redis enforces itself', async () => {
        await freshCache().setCacheValue('GET:/products', '{"a":1}', 90);

        expect(mockSet).toHaveBeenCalledWith(
            expect.stringContaining(':key:GET:/products'),
            '{"a":1}',
            { EX: 90 }
        );
    });

    it('registers the entry under every tag it was given', async () => {
        // This reverse index is the entire mechanism behind group invalidation: Redis cannot
        // efficiently delete "every key matching a pattern", so writes have to record their own
        // membership. A write that skips it produces an entry nothing can ever invalidate — it
        // just serves stale data until its TTL runs out.
        await freshCache().setCacheValue('GET:/products', '{}', 60, ['products', 'catalog']);

        expect(mockSAdd).toHaveBeenCalledTimes(2);
        expect(mockSAdd).toHaveBeenCalledWith(
            expect.stringContaining(':tag:products'),
            expect.stringContaining(':key:GET:/products')
        );
        expect(mockSAdd).toHaveBeenCalledWith(
            expect.stringContaining(':tag:catalog'),
            expect.stringContaining(':key:GET:/products')
        );
    });

    it('de-duplicates tags and drops empty ones', async () => {
        // Both halves matter: a repeated tag is a wasted round-trip, and an empty one creates a
        // junk `tag:` key that every future invalidation then reads and deletes for nothing.
        await freshCache().setCacheValue('GET:/products', '{}', 60, [
            'products',
            'products',
            '',
            'catalog'
        ]);

        expect(mockSAdd).toHaveBeenCalledTimes(2);
    });

    it('resolves rather than rejecting when the write fails', async () => {
        mockSet.mockImplementation(() => Promise.reject(new Error('OOM')));

        await expect(
            freshCache().setCacheValue('GET:/products', '{}', 60, ['products'])
        ).resolves.toBeUndefined();
    });

    // The TTL guard runs first and is the cheapest check there is: nothing is sent, and no client
    // is even asked for, on behalf of an entry that was never going to be written.
    it.each([0, -1])('refuses a TTL of %s, and indexes nothing', async (ttlSeconds) => {
        // Redis rejects `EX` values of zero or less, and a non-positive TTL means "do not cache"
        // anyway — so it is caught here rather than sent and refused. Asserting on `mockConnect`
        // is what pins the ORDER.
        await freshCache().setCacheValue('GET:/products', '{}', ttlSeconds, ['products']);

        expect(mockSet).not.toHaveBeenCalled();
        expect(mockSAdd).not.toHaveBeenCalled();
        expect(mockConnect).not.toHaveBeenCalled();
    });
});

// ─── The connection ──────────────────────────────────────────────────────────
/**
 * The lifecycle rules themselves live in `adapters/managed-connection.ts` and are tested there
 * against a fake handle. What is left here is what is Redis-specific: how a client is built, and
 * how it is closed.
 */
describe('the Redis client', () => {
    beforeEach(() => {
        mockConnect.mockImplementation(() => Promise.resolve());
        mockQuit.mockImplementation(() => Promise.resolve());
    });

    // Both spellings are supported so deployment config can stay flexible; the fragments are the
    // half a compose file usually has.
    it('assembles a URL from host and port when no full URL is given', async () => {
        delete process.env.NODE_REDIS_URL;
        process.env.NODE_REDIS_HOST = 'redis.internal';
        process.env.NODE_REDIS_PORT = '6380';

        await freshCache().startCache();

        expect(mockCreateClient).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'redis://redis.internal:6380' })
        );
    });

    it('defaults the host to localhost when only a port is given', async () => {
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_HOST;
        process.env.NODE_REDIS_PORT = '6379';

        await freshCache().startCache();

        expect(mockCreateClient).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'redis://127.0.0.1:6379' })
        );
    });

    it('closes politely on shutdown', async () => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        const cache = freshCache();
        await cache.startCache();

        await cache.stopCache();

        expect(mockQuit).toHaveBeenCalledTimes(1);
        expect(mockDestroy).not.toHaveBeenCalled();
    });

    /*
     * QUIT waits for queued replies, which an already-dead socket will never send. `destroy()`
     * drops it immediately — otherwise a shutdown against a Redis that went away first hangs on
     * the way out, which reads as a stuck deploy rather than as a dead cache.
     */
    it('destroys the socket when QUIT itself fails', async () => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockQuit.mockImplementation(() => Promise.reject(new Error('socket closed')));
        const cache = freshCache();
        await cache.startCache();

        await expect(cache.stopCache()).resolves.toBeUndefined();

        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('closes nothing when caching was never switched on', async () => {
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_PORT;

        await expect(freshCache().stopCache()).resolves.toBeUndefined();

        expect(mockQuit).not.toHaveBeenCalled();
        expect(mockConnect).not.toHaveBeenCalled();
    });

    // The state a health payload reports, and the reason it is a memory read: `GET
    // /observability/health` is polled by every replica forever, so it may not open a socket.
    it('reports disabled without connecting, and ready once connected', async () => {
        delete process.env.NODE_REDIS_URL;
        delete process.env.NODE_REDIS_PORT;
        const cache = freshCache();

        expect(cache.cacheState()).toBe('disabled');

        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockClient.isReady = true;
        try {
            await cache.startCache();
            expect(cache.cacheState()).toBe('ready');
        } finally {
            mockClient.isReady = false;
        }
    });
});

describe('invalidateCacheTags', () => {
    beforeEach(() => {
        process.env.NODE_REDIS_URL = 'redis://localhost:6379';
        mockConnect.mockImplementation(() => Promise.resolve());
        mockSMembers.mockImplementation(() => Promise.resolve([]));
        mockDel.mockImplementation(() => Promise.resolve(1));
    });

    it('deletes every entry in the tag, then the tag set itself', async () => {
        mockSMembers.mockImplementation(() => Promise.resolve(['app:key:a', 'app:key:b']));

        await freshCache().invalidateCacheTags(['products']);

        // One variadic DEL for the group rather than one call per key.
        expect(mockDel).toHaveBeenCalledWith(['app:key:a', 'app:key:b']);
        // And the index set, which would otherwise keep growing across invalidation cycles.
        expect(mockDel).toHaveBeenCalledWith(expect.stringContaining(':tag:products'));
    });

    it('does not issue a DEL with no arguments for an empty tag', async () => {
        // `DEL` with zero keys is a protocol error, not a no-op, so an empty set has to be
        // detected here. The tag key itself is still deleted.
        mockSMembers.mockImplementation(() => Promise.resolve([]));

        await freshCache().invalidateCacheTags(['products']);

        expect(mockDel).toHaveBeenCalledTimes(1);
        expect(mockDel).toHaveBeenCalledWith(expect.stringContaining(':tag:products'));
    });

    it('does nothing — not even connect — when every tag is empty', async () => {
        await freshCache().invalidateCacheTags(['', '']);

        expect(mockConnect).not.toHaveBeenCalled();
        expect(mockSMembers).not.toHaveBeenCalled();
    });

    it('reads each distinct tag once', async () => {
        await freshCache().invalidateCacheTags(['products', 'products', 'catalog']);

        expect(mockSMembers).toHaveBeenCalledTimes(2);
    });

    it('resolves rather than rejecting when Redis fails mid-invalidation', async () => {
        // The caller is a write that has already succeeded in Mongo. Rejecting here would turn a
        // completed write into an error response, and the client would retry a write that landed.
        mockSMembers.mockImplementation(() => Promise.reject(new Error('connection reset')));

        await expect(freshCache().invalidateCacheTags(['products'])).resolves.toEqual({
            deleted: 0,
            reachable: false
        });
    });

    /**
     * `reachable: false` is the whole reason this returns a value at all.
     *
     * The write has landed and its cached predecessor has not been removed, so the endpoint serves
     * a stale response for its full TTL — a customer edits a product, gets a 200, and the catalogue
     * shows the old one. Resolving `void` made that indistinguishable from a clean invalidation,
     * which is the ambiguity `ClearCacheResult` exists to remove; the middleware turns the `false`
     * into a counter and an `error` line.
     */
    it('reports success with the number of cached responses removed', async () => {
        const cache = freshCache();
        mockSMembers.mockImplementation(() => Promise.resolve(['a', 'b']));
        // Variadic DEL answers with how many keys it removed; the tag set's own deletion is not a
        // cached response and must not be counted with them.
        mockDel.mockImplementation((keys: string[] | string) =>
            Promise.resolve(Array.isArray(keys) ? keys.length : 1)
        );

        await expect(cache.invalidateCacheTags(['products'])).resolves.toEqual({
            deleted: 2,
            reachable: true
        });
    });

    it('is trivially reachable when there are no tags to invalidate', async () => {
        await expect(freshCache().invalidateCacheTags([])).resolves.toEqual({
            deleted: 0,
            reachable: true
        });
    });
});
