import type { Request, Response } from 'express';
import { requestLogger } from '@middlewares/request-logger';

jest.mock('@utils/winston', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    logger: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

jest.mock('@utils/observability', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    getRouteLabel: () => '/products'
}));

jest.mock('@utils/tracer', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    getActiveSpanContext: () => ({ traceId: 'trace-xyz', spanId: 'span-abc' })
}));

import { logger } from '@utils/winston';

const mockLog = logger.log as jest.MockedFunction<typeof logger.log>;

const buildRequest = (overrides: Partial<Request> = {}): Request =>
    ({
        method: 'GET',
        path: '/products',
        originalUrl: '/products',
        requestId: 'req-1',
        ...overrides
    }) as unknown as Request;

const buildResponse = (statusCode = 200): Response => {
    const listeners = new Map<string, Array<() => void>>();
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
    // eslint-disable-next-line prefer-const
    let response: Response;
    response = { statusCode, once, emit } as unknown as Response;
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
        expect(meta['headers']).toBeUndefined();
        expect(meta['user_id']).toBeUndefined();
        expect(meta['ip']).toBeUndefined();
        expect(meta['user_agent']).toBeUndefined();
    });

    it('does not log twice when finish fires more than once', () => {
        const res = buildResponse(200);
        requestLogger(buildRequest(), res, jest.fn());
        res.emit('finish');
        res.emit('finish');
        expect(mockLog).toHaveBeenCalledTimes(1);
    });
});
