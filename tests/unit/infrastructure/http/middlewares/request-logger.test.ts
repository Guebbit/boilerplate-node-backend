import { asStub } from '@tests/stub';
import type { Request, Response } from 'express';
import { requestLogger } from '@infrastructure/http/middlewares/request-logger';

jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    logger: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

jest.mock('@infrastructure/observability/metrics-http', () => ({
    __esModule: true,
    getRouteLabel: () => '/products'
}));

jest.mock('@infrastructure/observability/tracer', () => ({
    __esModule: true,
    getActiveSpanContext: () => ({ traceId: 'trace-xyz', spanId: 'span-abc' })
}));

import { logger } from '@infrastructure/adapters/logger';

const mockLog = logger.log as jest.MockedFunction<typeof logger.log>;

const buildRequest = (overrides: Partial<Request> = {}): Request =>
    asStub<Request>({
        method: 'GET',
        path: '/products',
        originalUrl: '/products',
        requestId: 'req-1',
        ...overrides
    });

const buildResponse = (statusCode = 200): Response => {
    const listeners = new Map<string, (() => void)[]>();
    const once = (event: string, handler: () => void) => {
        const existing = listeners.get(event) ?? [];
        existing.push(handler);
        listeners.set(event, existing);
        return response;
    };
    const emit = (event: string) => {
        const handlers = listeners.get(event) ?? [];
        for (const handler of handlers) handler();
        listeners.delete(event);
        return true;
    };
    // eslint-disable-next-line prefer-const -- the stub's own callbacks close over the variable they populate
    let response: Response;
    response = asStub<Response>({ statusCode, once, emit });
    return response;
};

describe('requestLogger', () => {
    beforeEach(() => jest.clearAllMocks());

    it('calls next() immediately', () => {
        const next = jest.fn();
        requestLogger(buildRequest(), buildResponse(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not log before finish', () => {
        requestLogger(buildRequest(), buildResponse(), jest.fn());
        expect(mockLog).not.toHaveBeenCalled();
    });

    it.each([
        [200, 'info'],
        [404, 'warn'],
        [500, 'error']
    ])('logs at correct level for status %i (%s)', (status, level) => {
        const res = buildResponse(status);
        requestLogger(buildRequest(), res, jest.fn());
        res.emit('finish');
        const callArgs = mockLog.mock.calls[0] as unknown[];
        expect(callArgs[0]).toBe(level);
    });

    it('logs only the slim metadata fields', () => {
        const res = buildResponse(200);
        requestLogger(buildRequest(), res, jest.fn());
        res.emit('finish');

        const callArgs = mockLog.mock.calls[0] as unknown[];
        const meta = callArgs[2] as Record<string, unknown>;
        expect(meta).toEqual({
            request_id: 'req-1',
            trace_id: 'trace-xyz',
            method: 'GET',
            route: '/products',
            status_code: 200,
            duration_ms: expect.any(Number)
        });
        expect(meta.headers).toBeUndefined();
        expect(meta.user_id).toBeUndefined();
        expect(meta.ip).toBeUndefined();
        expect(meta.user_agent).toBeUndefined();
    });

    it('does not log twice when finish fires more than once', () => {
        const res = buildResponse(200);
        requestLogger(buildRequest(), res, jest.fn());
        res.emit('finish');
        res.emit('finish');
        expect(mockLog).toHaveBeenCalledTimes(1);
    });
});
