import { asStub } from '@tests/stub';
import type { NextFunction, Request, Response } from 'express';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';
import * as cache from '@infrastructure/adapters/cache';

jest.mock('@infrastructure/adapters/cache', () => ({
    getCacheValue: jest.fn(),
    setCacheValue: jest.fn(),
    invalidateCacheTags: jest.fn(),
    // Identity by default so the tests below assert the TTL the route declared. The clamping
    // behaviour itself is tested against the real implementation in core/adapters/cache.test.ts.
    resolveCacheTtl: jest.fn((seconds: number) => seconds)
}));

const mockedCache = jest.mocked(cache);

const createResponse = () => {
    const headers: Record<string, string> = {};
    const listeners = new Map<string, () => void>();

    // Annotated: the stub's own callbacks return `response`, so inference would be circular.
    const response: Response = asStub<Response>({
        statusCode: 200,
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
    mockedCache.getCacheValue.mockResolvedValue(void 0 as never);
    const middleware = setCache(60, { tags: ['products'], keyParameters });
    await middleware(
        asStub<Request>({ method: 'GET', originalUrl, query, locale: 'en' }),
        createResponse().response,
        jest.fn() as NextFunction
    );
    const { calls } = mockedCache.getCacheValue.mock;
    return calls.at(-1)?.[0];
};

describe('setCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedCache.resolveCacheTtl.mockImplementation((seconds: number) => seconds);
    });

    it('returns a cached response when Redis has a match', async () => {
        mockedCache.getCacheValue.mockResolvedValue({
            status: 200,
            body: { success: true }
        });

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

    it('stores successful uncached responses after the handler runs', async () => {
        mockedCache.getCacheValue.mockResolvedValue(void 0 as never);

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
            {
                status: 201,
                body: { success: true, data: [] }
            },
            120,
            ['products']
        );
    });

    it('stores and advertises the clamped TTL, not the declared one', async () => {
        // Stand in for the dev cap: the route asks for an hour, the resolver allows 30s.
        mockedCache.resolveCacheTtl.mockReturnValue(30);
        mockedCache.getCacheValue.mockResolvedValue(void 0 as never);

        const middleware = setCache(3600, { tags: ['products'], keyParameters: [] });
        const { response, headers } = createResponse();
        const request = asStub<Request>({
            method: 'GET',
            originalUrl: '/products',
            query: {}
        });

        await middleware(request, response, jest.fn() as NextFunction);

        expect(mockedCache.resolveCacheTtl).toHaveBeenCalledWith(3600);
        // The browser must not be told to hold it longer than the server will
        expect(headers['cache-control']).toBe('public, max-age=30');

        response.json({ success: true });

        expect(mockedCache.setCacheValue).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
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
            mockedCache.resolveCacheTtl.mockReturnValue(30);
            mockedCache.getCacheValue.mockResolvedValue(void 0 as never);

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
        mockedCache.resolveCacheTtl.mockReturnValue(30);
        mockedCache.getCacheValue.mockResolvedValue(void 0 as never);

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

    it('skips caching entirely when the TTL resolves to zero', async () => {
        mockedCache.resolveCacheTtl.mockReturnValue(0);

        const middleware = setCache(3600, { tags: ['products'], keyParameters: [] });
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
