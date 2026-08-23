/**
 * The HTTP response cache: the key, the headers, the envelope, the TTL policy and the size gate.
 *
 * Everything the adapter underneath does NOT decide. It stores bytes under a key; which bytes,
 * for how long, and up to what size are response questions, and they are answered here — so the
 * TTL clamp and the byte limit are exercised against their real implementations rather than a
 * mock, and only the Redis round-trip is stubbed.
 *
 * `NODE_ENV` is 'test' under jest, so the development TTL ceiling applies to every case below.
 * The blocks that are not about clamping switch it off with `NODE_REDIS_CACHE_DEV_TTL_MAX=0`,
 * which means "no cap" — otherwise every declared TTL would silently arrive as 30.
 */
import { asStub } from '@tests/stub';
import type { NextFunction, Request, Response } from 'express';
import {
    invalidateCache,
    noStore,
    resolveCacheTtl,
    setCache
} from '@infrastructure/http/middlewares/cache';
import * as cache from '@infrastructure/adapters/cache';

jest.mock('@infrastructure/adapters/cache', () => ({
    getCacheValue: jest.fn(),
    setCacheValue: jest.fn(),
    invalidateCacheTags: jest.fn()
}));

// The size gate logs the entry it refuses; silence it so a passing run is quiet.
jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const mockedCache = jest.mocked(cache);

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_TTL_MAX = process.env.NODE_REDIS_CACHE_DEV_TTL_MAX;
const ORIGINAL_MAX_BYTES = process.env.NODE_REDIS_CACHE_MAX_BYTES;

const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
};

afterEach(() => {
    restore('NODE_ENV', ORIGINAL_NODE_ENV);
    restore('NODE_REDIS_CACHE_DEV_TTL_MAX', ORIGINAL_TTL_MAX);
    restore('NODE_REDIS_CACHE_MAX_BYTES', ORIGINAL_MAX_BYTES);
});

const createResponse = () => {
    const headers: Record<string, string> = {};
    const listeners = new Map<string, () => void>();

    // Annotated: the stub's own callbacks return `response`, so inference would be circular.
    const response: Response = asStub<Response>({
        statusCode: 200,
        locals: {},
        set: jest.fn((name: string, value: string) => {
            headers[name.toLowerCase()] = value;
            return response;
        }),
        status: jest.fn((statusCode: number) => {
            response.statusCode = statusCode;
            return response;
        }),
        // Express appends rather than replaces, and the real stack already carries `Vary: Origin`
        // from CORS — so the mock has to append too, or a test could pass while the real response
        // dropped a header it must keep.
        vary: jest.fn((field: string) => {
            const existing = headers.vary;
            headers.vary = existing ? `${existing}, ${field}` : field;
            return response;
        }),
        json: jest.fn((body: unknown) => body),
        on: jest.fn((event: string, handler: () => void) => {
            listeners.set(event, handler);
            return response;
        })
    });

    return { response, headers, listeners };
};

/** Runs the middleware and returns the key it looked up. */
const keyFor = async (
    query: Record<string, unknown>,
    keyParameters: readonly string[],
    originalUrl = '/products'
) => {
    mockedCache.getCacheValue.mockResolvedValue(undefined);
    const middleware = setCache(60, { tags: ['products'], keyParameters });
    await middleware(
        asStub<Request>({ method: 'GET', originalUrl, query, locale: 'en' }),
        createResponse().response,
        jest.fn() as NextFunction
    );
    const { calls } = mockedCache.getCacheValue.mock;
    return calls.at(-1)?.[0];
};

/**
 * The key for one request written as a POST body instead of a query string.
 *
 * `keyAs` is what unifies the two spellings, so it is passed on both sides of every comparison
 * below — the point being tested is that transport and method stop mattering, not that they are
 * ignored generally.
 */
const bodyKeyFor = async (
    body: Record<string, unknown>,
    keyParameters: readonly string[],
    keyAs = 'products:search'
) => {
    mockedCache.getCacheValue.mockResolvedValue(undefined);
    const middleware = setCache(60, { tags: ['products'], keyParameters, keyAs });
    await middleware(
        asStub<Request>({
            method: 'POST',
            originalUrl: '/products/search',
            query: {},
            body,
            locale: 'en'
        }),
        createResponse().response,
        jest.fn() as NextFunction
    );
    return mockedCache.getCacheValue.mock.calls.at(-1)?.[0];
};

/** The same, for the GET spelling — `keyFor` without a `keyAs` cannot be compared against it. */
const sharedQueryKeyFor = async (
    query: Record<string, unknown>,
    keyParameters: readonly string[],
    keyAs = 'products:search'
) => {
    mockedCache.getCacheValue.mockResolvedValue(undefined);
    const middleware = setCache(60, { tags: ['products'], keyParameters, keyAs });
    await middleware(
        asStub<Request>({ method: 'GET', originalUrl: '/products', query, locale: 'en' }),
        createResponse().response,
        jest.fn() as NextFunction
    );
    return mockedCache.getCacheValue.mock.calls.at(-1)?.[0];
};

/** Drive one MISS through the middleware and let the controller answer with `body`. */
const storeThrough = async (body: unknown, seconds = 60) => {
    mockedCache.getCacheValue.mockResolvedValue(undefined);
    const middleware = setCache(seconds, { tags: ['products'], keyParameters: [] });
    const { response } = createResponse();

    await middleware(
        asStub<Request>({ method: 'GET', originalUrl: '/products', query: {}, locale: 'en' }),
        response,
        jest.fn() as NextFunction
    );

    response.statusCode = 200;
    response.json(body);
};

describe('setCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // No cap: these cases are about the key and the headers, not about clamping.
        process.env.NODE_REDIS_CACHE_DEV_TTL_MAX = '0';
    });

    it('returns a cached response when Redis has a match', async () => {
        mockedCache.getCacheValue.mockResolvedValue(
            JSON.stringify({ status: 200, body: { success: true } })
        );

        const middleware = setCache(60, { tags: ['products'], keyParameters: ['page'] });
        const { response, headers } = createResponse();
        const next = jest.fn() as NextFunction;
        const request = asStub<Request>({
            method: 'GET',
            originalUrl: '/products?page=1',
            query: { page: '1' },
            locale: 'en'
        });

        await middleware(request, response, next);

        expect(mockedCache.getCacheValue).toHaveBeenCalledWith('GET:/products?page="1":guest:en');
        expect(headers['x-cache']).toBe('HIT');
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith({ success: true });
        expect(next).not.toHaveBeenCalled();
    });

    /*
     * A half-written or hand-edited entry must degrade to "not cached". If the parse failure
     * escaped, one bad key would turn a working endpoint into a 500 until someone noticed and
     * deleted it by hand — and the adapter cannot catch it, since to the adapter the value is
     * bytes it never reads.
     */
    it('treats a corrupt entry as a miss rather than throwing', async () => {
        mockedCache.getCacheValue.mockResolvedValue('{not json');

        const middleware = setCache(60, { tags: ['products'], keyParameters: [] });
        const { response, headers } = createResponse();
        const next = jest.fn() as NextFunction;

        await middleware(
            asStub<Request>({ method: 'GET', originalUrl: '/products', query: {}, locale: 'en' }),
            response,
            next
        );

        expect(headers['x-cache']).toBe('MISS');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('stores successful uncached responses after the handler runs', async () => {
        mockedCache.getCacheValue.mockResolvedValue(undefined);

        const middleware = setCache(120, { tags: ['products'], keyParameters: [] });
        const { response, headers } = createResponse();
        const next = jest.fn() as NextFunction;
        const request = asStub<Request>({
            method: 'GET',
            originalUrl: '/products',
            query: {},
            locale: 'en',
            authContext: {
                id: '507f1f77bcf86cd799439011'
            }
        });

        await middleware(request, response, next);

        expect(headers['x-cache']).toBe('MISS');
        expect(next).toHaveBeenCalledTimes(1);

        response.statusCode = 201;
        response.json({ success: true, data: [] });

        expect(mockedCache.setCacheValue).toHaveBeenCalledWith(
            'GET:/products?:user:507f1f77bcf86cd799439011:en',
            JSON.stringify({ status: 201, body: { success: true, data: [] } }),
            120,
            ['products']
        );
    });

    it('stores and advertises the clamped TTL, not the declared one', async () => {
        // The dev cap: the route asks for an hour, the ceiling allows 30s.
        process.env.NODE_REDIS_CACHE_DEV_TTL_MAX = '30';
        mockedCache.getCacheValue.mockResolvedValue(undefined);

        const middleware = setCache(3600, { tags: ['products'], keyParameters: [] });
        const { response, headers } = createResponse();
        const request = asStub<Request>({
            method: 'GET',
            originalUrl: '/products',
            query: {}
        });

        await middleware(request, response, jest.fn() as NextFunction);

        // The browser must not be told to hold it longer than the server will
        expect(headers['cache-control']).toBe('public, max-age=30');

        response.json({ success: true });

        expect(mockedCache.setCacheValue).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            30,
            ['products']
        );
    });

    // The Redis key is scoped per user, but that tells the *browser* nothing about the body
    // depending on who asked: an anonymous `GET /products` answering `public, max-age=30` is
    // stored locally and replayed to an admin hitting the same URL seconds later — admin header,
    // admin row controls, anonymous data, no request reaching the API at all. Both scopes must
    // name `Authorization` in `Vary`, since it is the only input `getAuth` reads.
    //
    // `Accept-Language` is there for the same reason with a different header: bodies carry
    // translated `message` / `errors` copy, so a cache that does not key on it hands an Italian
    // body to the next English caller of the same URL.
    it.each([
        ['guest', {} as Partial<Request>, 'public, max-age=30'],
        [
            'authenticated',
            { authContext: { id: '507f1f77bcf86cd799439011' } } as Partial<Request>,
            'private, max-age=30'
        ]
    ])(
        'varies a %s response on Authorization and Accept-Language',
        async (_scope, extraRequest, cacheControl) => {
            mockedCache.getCacheValue.mockResolvedValue(undefined);

            const middleware = setCache(30, {
                tags: ['products'],
                keyParameters: ['page', 'pageSize']
            });
            const { response, headers } = createResponse();
            const request = asStub<Request>({
                method: 'GET',
                originalUrl: '/products?page=1&pageSize=10',
                query: { page: '1', pageSize: '10' },
                ...extraRequest
            });

            await middleware(request, response, jest.fn() as NextFunction);

            expect(headers.vary).toBe('Authorization, Accept-Language');
            expect(headers['cache-control']).toBe(cacheControl);
        }
    );

    /**
     * The server-side twin of the `Vary` guard above: two requests for the same URL, from the
     * same (anonymous) caller, in different languages must not share a Redis entry.
     */
    it('keys the Redis entry by locale, so languages cannot share an entry', async () => {
        mockedCache.getCacheValue.mockResolvedValue(undefined);

        const middleware = setCache(30, { tags: ['products'], keyParameters: [] });

        for (const locale of ['en', 'it'])
            await middleware(
                asStub<Request>({
                    method: 'GET',
                    originalUrl: '/products',
                    query: {},
                    locale
                }),
                createResponse().response,
                jest.fn() as NextFunction
            );

        expect(mockedCache.getCacheValue.mock.calls.map(([key]) => key)).toEqual([
            'GET:/products?:guest:en',
            'GET:/products?:guest:it'
        ]);
    });

    /*
     * The cache key is built from the DECLARED parameters, not from `request.originalUrl`.
     *
     * Keying on the raw URL made the key depend on how a request was written rather than on what
     * it asked for. The first case below is what that cost in ordinary traffic — query-string
     * order is not stable across HTTP clients, so the same request arrived under two keys and
     * paid for a second Mongo query behind the second one.
     */
    describe('cache key', () => {
        it('gives two orderings of the same request one key', async () => {
            const declared = ['page', 'pageSize'];

            expect(await keyFor({ page: '1', pageSize: '10' }, declared)).toBe(
                await keyFor({ pageSize: '10', page: '1' }, declared)
            );
        });

        it('ignores a parameter nobody declared', async () => {
            expect(await keyFor({ page: '1', junk: 'a' }, ['page'])).toBe(
                await keyFor({ page: '1', junk: 'b' }, ['page'])
            );
            expect(await keyFor({ junk: 'a' }, ['page'])).toBe(await keyFor({}, ['page']));
        });

        // The point of the declaration: a parameter that changes the answer must change the key,
        // or two different searches share one cached response.
        it('separates requests that differ in a declared parameter', async () => {
            expect(await keyFor({ page: '1' }, ['page'])).not.toBe(
                await keyFor({ page: '2' }, ['page'])
            );
        });

        // `?tag=a&tag=b` arrives as an array, and must not collide with the single value 'a,b'.
        it('distinguishes a repeated parameter from a single one', async () => {
            expect(await keyFor({ tag: ['a', 'b'] }, ['tag'])).not.toBe(
                await keyFor({ tag: 'a,b' }, ['tag'])
            );
        });

        // Absent is not the same request as present-but-blank: the schemas treat them alike, but
        // the key does not assume that on their behalf.
        it('distinguishes an absent parameter from a blank one', async () => {
            expect(await keyFor({}, ['page'])).not.toBe(await keyFor({ page: '' }, ['page']));
        });

        // The path is still the whole identity of a path-only route.
        it('keeps different paths apart when no parameter is declared', async () => {
            expect(await keyFor({}, [], '/products/abc')).not.toBe(
                await keyFor({}, [], '/products/def')
            );
        });

        // `in` walks the prototype chain, so this would otherwise count as present on every
        // request and put `toString=undefined` into every key.
        it('does not mistake an inherited property for a supplied parameter', async () => {
            expect(await keyFor({}, ['toString'])).toBe(await keyFor({}, []));
        });
    });

    /*
     * The four searches are one question with two spellings. `keyAs` is what says so, and these
     * are the properties that make saying so safe.
     */
    describe('a search cached under a shared identity', () => {
        const declared = ['page', 'pageSize', 'text'];

        // The whole point: whichever spelling asks first pays for the Mongo query, and the other
        // is served from that entry.
        it('gives the query and body spellings of one search the same key', async () => {
            expect(await bodyKeyFor({ page: '1', text: 'x' }, declared)).toBe(
                await sharedQueryKeyFor({ page: '1', text: 'x' }, declared)
            );
        });

        // A query string carries `1` as the string '1'; a JSON body carries the number. Without
        // normalisation the two spell the same request differently and never share an entry.
        it('reads a JSON number and a query string as the same value', async () => {
            expect(await bodyKeyFor({ page: 1 }, declared)).toBe(
                await sharedQueryKeyFor({ page: '1' }, declared)
            );
        });

        // The allowlist is the whole defence: without it any caller mints an unbounded number of
        // entries by adding a field the endpoint never reads.
        it('ignores a body field nobody declared', async () => {
            expect(await bodyKeyFor({ page: '1', junk: 'a' }, declared)).toBe(
                await bodyKeyFor({ page: '1', junk: 'b' }, declared)
            );
        });

        // Everything the query form separates, the body form must separate too.
        it('separates bodies that differ in a declared parameter', async () => {
            expect(await bodyKeyFor({ text: 'a' }, declared)).not.toBe(
                await bodyKeyFor({ text: 'b' }, declared)
            );
        });

        // `readInput`'s `search` surface reads body before query. The key has to agree, or it
        // answers a request the controller is not about to serve.
        it('prefers the body over the query, as the search surface does', async () => {
            mockedCache.getCacheValue.mockResolvedValue(undefined);
            const middleware = setCache(60, {
                tags: ['products'],
                keyParameters: declared,
                keyAs: 'products:search'
            });
            await middleware(
                asStub<Request>({
                    method: 'POST',
                    originalUrl: '/products/search',
                    query: { text: 'from-query' },
                    body: { text: 'from-body' },
                    locale: 'en'
                }),
                createResponse().response,
                jest.fn() as NextFunction
            );
            const key = mockedCache.getCacheValue.mock.calls.at(-1)?.[0];

            expect(key).toBe(await bodyKeyFor({ text: 'from-body' }, declared));
        });

        // Two different searches sharing an entry is the bug this whole declaration exists to
        // prevent; a shared identity must not reintroduce it across resources.
        it('keeps two resources apart even when their parameters match', async () => {
            expect(await bodyKeyFor({ page: '1' }, declared, 'products:search')).not.toBe(
                await bodyKeyFor({ page: '1' }, declared, 'orders:search')
            );
        });

        // A POST response is not browser-cacheable under RFC 9110, whatever Redis does with it.
        it('tells the browser not to store the POST it is caching server-side', async () => {
            mockedCache.getCacheValue.mockResolvedValue(undefined);
            const { response, headers } = createResponse();
            const middleware = setCache(60, {
                tags: ['products'],
                keyParameters: [],
                keyAs: 'products:search'
            });

            await middleware(
                asStub<Request>({
                    method: 'POST',
                    originalUrl: '/products/search',
                    query: {},
                    body: {},
                    locale: 'en'
                }),
                response,
                jest.fn() as NextFunction
            );

            expect(headers['cache-control']).toBe('no-store');
            expect(mockedCache.getCacheValue).toHaveBeenCalled();
        });

        // Without the identity a POST would key on `POST:/path` and cache whatever mounted this
        // next — a write included. Requiring it makes caching a POST an explicit claim.
        it('refuses to cache a POST that declared no shared identity', async () => {
            const middleware = setCache(60, { tags: ['products'], keyParameters: [] });
            const next = jest.fn() as NextFunction;

            await middleware(
                asStub<Request>({
                    method: 'POST',
                    originalUrl: '/products',
                    query: {},
                    body: {},
                    locale: 'en'
                }),
                createResponse().response,
                next
            );

            expect(next).toHaveBeenCalledTimes(1);
            expect(mockedCache.getCacheValue).not.toHaveBeenCalled();
        });

        // There is nothing for a browser to revalidate on a response it may not store.
        it('refuses browserRevalidate on a POST rather than ignoring it', () => {
            const middleware = setCache(60, {
                tags: ['products'],
                keyParameters: [],
                keyAs: 'products:search',
                browserRevalidate: true
            });

            expect(() =>
                middleware(
                    asStub<Request>({
                        method: 'POST',
                        originalUrl: '/products/search',
                        query: {},
                        body: {}
                    }),
                    createResponse().response,
                    jest.fn() as NextFunction
                )
            ).toThrow(/GET-only/);
        });
    });

    it('skips caching entirely when the TTL resolves to zero', async () => {
        const middleware = setCache(0, { tags: ['products'], keyParameters: [] });
        const { response } = createResponse();
        const next = jest.fn() as NextFunction;
        const request = asStub<Request>({
            method: 'GET',
            originalUrl: '/products',
            query: {}
        });

        await middleware(request, response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(mockedCache.getCacheValue).not.toHaveBeenCalled();
    });

    it('refuses to run on a response noStore already marked no-store', () => {
        const { response, headers } = createResponse();
        noStore(asStub<Request>({ headers: {} }), response, jest.fn() as NextFunction);

        const middleware = setCache(3600, { tags: ['account'], keyParameters: [] });
        const request = asStub<Request>({ method: 'GET', originalUrl: '/account', query: {} });

        expect(() => middleware(request, response, jest.fn() as NextFunction)).toThrow(/noStore/);

        // The header noStore set must survive unreplaced — this is the bug the guard exists to
        // stop: unchecked, setCache would call response.set('Cache-Control', …) right here.
        expect(headers['cache-control']).toBe('no-store');
        expect(mockedCache.getCacheValue).not.toHaveBeenCalled();
    });
});

describe('noStore', () => {
    it('forbids every cache from storing the response', () => {
        const { response, headers } = createResponse();

        noStore(asStub<Request>({ headers: {} }), response, jest.fn() as NextFunction);

        expect(headers['cache-control']).toBe('no-store');
    });

    it('marks the response so setCache can refuse to run on top of it', () => {
        const { response } = createResponse();

        noStore(asStub<Request>({ headers: {} }), response, jest.fn() as NextFunction);

        expect(response.locals.noStore).toBe(true);
    });

    it('drops conditional request headers, so a stale ETag cannot short-circuit to a bodyless 304', () => {
        const { response } = createResponse();
        const headers: Record<string, string> = {
            'if-none-match': '"abc"',
            'if-modified-since': 'Wed, 21 Oct 2015 07:28:00 GMT'
        };

        noStore(asStub<Request>({ headers }), response, jest.fn() as NextFunction);

        expect(headers['if-none-match']).toBeUndefined();
        expect(headers['if-modified-since']).toBeUndefined();
    });

    it('calls next', () => {
        const { response } = createResponse();
        const next = jest.fn() as NextFunction;

        noStore(asStub<Request>({ headers: {} }), response, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});

// ─── The TTL policy ──────────────────────────────────────────────────────────
/**
 * Cache invalidation only fires for writes that go through the API, so anything writing straight
 * to Mongo (`db:seed`, migrations, `mongosh`) leaves stale answers behind until they expire.
 * Outside production the declared TTL is clamped so that window is seconds, not an hour.
 *
 * `resolveCacheTtl` reads `process.env` on every call, so no re-import is needed between cases —
 * but NODE_ENV has to be restored, since jest sets it to 'test' globally.
 */
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

// ─── The size gate ───────────────────────────────────────────────────────────
/** A response body whose serialized form is comfortably above the given byte count. */
const bodyOfAtLeast = (bytes: number) => ({ items: 'x'.repeat(bytes) });

/*
 * A cache turns a cheap request into long-lived server state, which is a different risk from
 * simply answering it. `GET /products` is public, its entries live for an hour, and the key
 * carries the full URL — so without a bound on entry size an unauthenticated caller can mint a
 * distinct multi-megabyte entry per query string and keep every one of them resident. The page
 * size limit bounds this in practice; this guard is what makes it true regardless of which
 * endpoint is writing, and of whether that endpoint's own bounds are ever loosened.
 */
describe('the per-entry size limit', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.NODE_REDIS_CACHE_DEV_TTL_MAX = '0';
    });

    it('stores a response within the limit', async () => {
        await storeThrough({ items: [] });

        expect(mockedCache.setCacheValue).toHaveBeenCalledTimes(1);
    });

    it('skips a response above the limit instead of storing it', async () => {
        await storeThrough(bodyOfAtLeast(300 * 1024));

        expect(mockedCache.setCacheValue).not.toHaveBeenCalled();
    });

    // Measured against the bytes that would actually be written: a body of multi-byte characters
    // is larger than its length in code units suggests.
    it('measures bytes, not string length', async () => {
        process.env.NODE_REDIS_CACHE_MAX_BYTES = '100';

        await storeThrough({ items: '€'.repeat(40) });

        expect(mockedCache.setCacheValue).not.toHaveBeenCalled();
    });

    it('honours a custom limit', async () => {
        process.env.NODE_REDIS_CACHE_MAX_BYTES = String(1024 * 1024);

        await storeThrough(bodyOfAtLeast(300 * 1024));

        expect(mockedCache.setCacheValue).toHaveBeenCalledTimes(1);
    });

    // Skipping is a lost optimisation, not a failure: the caller has already been served, and the
    // response still goes out.
    it('still answers the request it refused to cache', async () => {
        mockedCache.getCacheValue.mockResolvedValue(undefined);
        const middleware = setCache(60, { tags: ['products'], keyParameters: [] });
        const { response } = createResponse();
        // Held before the middleware runs: `setCache` replaces `response.json` with the wrapper
        // that writes to the cache, and the wrapper is what must still reach this one.
        const sendJson = response.json;

        await middleware(
            asStub<Request>({ method: 'GET', originalUrl: '/products', query: {}, locale: 'en' }),
            response,
            jest.fn() as NextFunction
        );

        const body = bodyOfAtLeast(300 * 1024);
        response.json(body);

        expect(sendJson).toHaveBeenCalledWith(body);
    });
});

describe('invalidateCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedCache.invalidateCacheTags.mockResolvedValue({ deleted: 1, reachable: true });
    });

    it('invalidates tags after successful responses finish', async () => {
        const middleware = invalidateCache(['orders']);
        const { response, listeners } = createResponse();
        const next = jest.fn() as NextFunction;

        middleware({} as Request, response, next);

        expect(next).toHaveBeenCalledTimes(1);

        response.statusCode = 204;
        listeners.get('finish')?.();

        // flush microtasks so .then() chain runs
        await Promise.resolve();

        expect(mockedCache.invalidateCacheTags).toHaveBeenCalledWith(['orders']);
    });

    it('skips invalidation for failed responses', () => {
        const middleware = invalidateCache(['orders']);
        const { response, listeners } = createResponse();

        middleware({} as Request, response, jest.fn() as NextFunction);

        response.statusCode = 500;
        listeners.get('finish')?.();

        expect(mockedCache.invalidateCacheTags).not.toHaveBeenCalled();
    });
});
