import type { NextFunction, Request, Response } from 'express';
import { invalidateCache, setCache } from '@middlewares/cache';
import * as cache from '@core/adapters/cache';

jest.mock('@core/adapters/cache', () => ({
    getCacheValue: jest.fn(),
    setCacheValue: jest.fn(),
    invalidateCacheTags: jest.fn(),
    broadcastCacheInvalidation: jest.fn(),
    // Identity by default so the tests below assert the TTL the route declared. The clamping
    // behaviour itself is tested against the real implementation in core/adapters/cache.test.ts.
    resolveCacheTtl: jest.fn((seconds: number) => seconds)
}));

const mockedCache = jest.mocked(cache);

const createResponse = () => {
    const headers: Record<string, string> = {};
    const listeners = new Map<string, () => void>();

    const response = {
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
            const existing = headers['vary'];
            headers['vary'] = existing ? `${existing}, ${field}` : field;
            return response;
        }),
        json: jest.fn((body: unknown) => body),
        on: jest.fn((event: string, handler: () => void) => {
            listeners.set(event, handler);
            return response;
        })
    } as unknown as Response;

    return { response, headers, listeners };
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

        const middleware = setCache(60, { tags: ['products'] });
        const { response, headers } = createResponse();
        const next = jest.fn() as NextFunction;
        const request = {
            method: 'GET',
            originalUrl: '/products?page=1'
        } as Request;

        await middleware(request, response, next);

        expect(mockedCache.getCacheValue).toHaveBeenCalledWith('GET:/products?page=1:guest');
        expect(headers['x-cache']).toBe('HIT');
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith({ success: true });
        expect(next).not.toHaveBeenCalled();
    });

    it('stores successful uncached responses after the handler runs', async () => {
        mockedCache.getCacheValue.mockResolvedValue(void 0 as never);

        const middleware = setCache(120, { tags: ['products'] });
        const { response, headers } = createResponse();
        const next = jest.fn() as NextFunction;
        const request = {
            method: 'GET',
            originalUrl: '/products',
            authContext: {
                id: '507f1f77bcf86cd799439011'
            }
        } as unknown as Request;

        await middleware(request, response, next);

        expect(headers['x-cache']).toBe('MISS');
        expect(next).toHaveBeenCalledTimes(1);

        response.statusCode = 201;
        response.json({ success: true, data: [] });

        expect(mockedCache.setCacheValue).toHaveBeenCalledWith(
            'GET:/products:user:507f1f77bcf86cd799439011',
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

        const middleware = setCache(3600, { tags: ['products'] });
        const { response, headers } = createResponse();
        const request = { method: 'GET', originalUrl: '/products' } as Request;

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

    // Regression guard. The Redis key is scoped per user, but nothing told the *browser* that the
    // body depends on who asked: an anonymous `GET /products` answered `public, max-age=30`, the
    // browser stored it, and an admin hitting the same URL seconds later was served those 3 public
    // rows from local cache without a request ever reaching the API — admin header, admin row
    // controls, anonymous data. Both scopes must name `Authorization` in `Vary`, since it is the
    // only input `getAuth` reads.
    it.each([
        ['guest', {} as Partial<Request>, 'public, max-age=30'],
        [
            'authenticated',
            { authContext: { id: '507f1f77bcf86cd799439011' } } as Partial<Request>,
            'private, max-age=30'
        ]
    ])('varies a %s response on Authorization', async (_scope, extraRequest, cacheControl) => {
        mockedCache.resolveCacheTtl.mockReturnValue(30);
        mockedCache.getCacheValue.mockResolvedValue(void 0 as never);

        const middleware = setCache(30, { tags: ['products'] });
        const { response, headers } = createResponse();
        const request = {
            method: 'GET',
            originalUrl: '/products?page=1&pageSize=10',
            ...extraRequest
        } as unknown as Request;

        await middleware(request, response, jest.fn() as NextFunction);

        expect(headers['vary']).toBe('Authorization');
        expect(headers['cache-control']).toBe(cacheControl);
    });

    it('skips caching entirely when the TTL resolves to zero', async () => {
        mockedCache.resolveCacheTtl.mockReturnValue(0);

        const middleware = setCache(3600, { tags: ['products'] });
        const { response } = createResponse();
        const next = jest.fn() as NextFunction;
        const request = { method: 'GET', originalUrl: '/products' } as Request;

        await middleware(request, response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(mockedCache.getCacheValue).not.toHaveBeenCalled();
    });
});

describe('invalidateCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedCache.invalidateCacheTags.mockResolvedValue();
        mockedCache.broadcastCacheInvalidation.mockResolvedValue();
    });

    it('invalidates tags and broadcasts after successful responses finish', async () => {
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
        expect(mockedCache.broadcastCacheInvalidation).toHaveBeenCalledWith(['orders']);
    });

    it('skips invalidation for failed responses', () => {
        const middleware = invalidateCache(['orders']);
        const { response, listeners } = createResponse();

        middleware({} as Request, response, jest.fn() as NextFunction);

        response.statusCode = 500;
        listeners.get('finish')?.();

        expect(mockedCache.invalidateCacheTags).not.toHaveBeenCalled();
        expect(mockedCache.broadcastCacheInvalidation).not.toHaveBeenCalled();
    });
});
