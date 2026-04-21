import type { NextFunction, Request, Response } from 'express';
import { invalidateCache, setCache } from '@utils/helpers-response';
import * as cache from '@utils/cache';

jest.mock('@utils/cache', () => ({
    getCacheValue: jest.fn(),
    setCacheValue: jest.fn(),
    invalidateCacheTags: jest.fn()
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
            user: {
                _id: '507f1f77bcf86cd799439011'
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
});

describe('invalidateCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('invalidates tags after successful responses finish', () => {
        const middleware = invalidateCache(['orders']);
        const { response, listeners } = createResponse();
        const next = jest.fn() as NextFunction;

        middleware({} as Request, response, next);

        expect(next).toHaveBeenCalledTimes(1);

        response.statusCode = 204;
        listeners.get('finish')?.();

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
