import type { Request, Response } from 'express';
import { requestLogger } from '@middlewares/request-logger';

// ---------------------------------------------------------------------------
// Mock the logger so tests do not produce real output
// ---------------------------------------------------------------------------

jest.mock('@utils/winston', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    logger: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    auditLogger: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

// Mock the route normalizer to return a predictable value
jest.mock('@utils/observability', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    getRouteLabel: () => '/products'
}));

import { logger } from '@utils/winston';

const mockLog = logger.log as jest.MockedFunction<typeof logger.log>;

// ---------------------------------------------------------------------------
// Helper: build a minimal fake request/response pair
// ---------------------------------------------------------------------------

const buildMockRequest = (overrides: Partial<Request> = {}): Request => ({
    method: 'GET',
    path: '/products',
    originalUrl: '/products',
    ip: '127.0.0.1',
    requestId: 'test-request-id',
    traceContext: {
        traceId: 'aaaa',
        spanId: 'bbbb'
    },
    user: undefined,
    // Build headers using fromEntries to avoid linter warnings on hyphenated keys
    headers: Object.fromEntries([
        ['content-type', 'application/json'],
        ['user-agent', 'jest-test']
    ]) as Request['headers'],
    ...overrides
} as unknown as Request);

/**
 * Build a minimal mock response backed by a plain object with an `on` / `once`
 * / `emit` shim so we can trigger the `finish` event the middleware listens for.
 */
const buildMockResponse = (statusCode = 200): Response => {
    // Use a lightweight object with a minimal EventTarget-like interface rather
    // than a full EventEmitter to keep the test dependency surface small.
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
        // `once` semantics: remove after first fire
        listeners.delete(event);
        return true;
    };

    // eslint-disable-next-line prefer-const
    let response: Response;
    response = { statusCode, once, emit } as unknown as Response;
    return response;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requestLogger middleware', () => {
    beforeEach(() => jest.clearAllMocks());

    it('calls next() immediately', () => {
        const req = buildMockRequest();
        const res = buildMockResponse();
        const next = jest.fn();

        requestLogger(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not log before the response finishes', () => {
        const req = buildMockRequest();
        const res = buildMockResponse();
        const next = jest.fn();

        requestLogger(req, res, next);

        // finish not yet emitted
        expect(mockLog).not.toHaveBeenCalled();
    });

    it('logs at info level for 2xx responses', () => {
        const req = buildMockRequest();
        const res = buildMockResponse(200);
        const next = jest.fn();

        requestLogger(req, res, next);
        res.emit('finish');

        expect(mockLog).toHaveBeenCalledTimes(1);
        expect(mockLog.mock.calls[0][0]).toBe('info');
    });

    it('logs at warn level for 4xx responses', () => {
        const req = buildMockRequest();
        const res = buildMockResponse(404);
        const next = jest.fn();

        requestLogger(req, res, next);
        res.emit('finish');

        expect(mockLog.mock.calls[0][0]).toBe('warn');
    });

    it('logs at error level for 5xx responses', () => {
        const req = buildMockRequest();
        const res = buildMockResponse(500);
        const next = jest.fn();

        requestLogger(req, res, next);
        res.emit('finish');

        expect(mockLog.mock.calls[0][0]).toBe('error');
    });

    it('includes request_id, method, route, and status_code in log metadata', () => {
        const req = buildMockRequest();
        const res = buildMockResponse(200);
        const next = jest.fn();

        requestLogger(req, res, next);
        res.emit('finish');

        // logger.log is called as log(level, message, metaObject); grab the third element via spread
        const callArgs = mockLog.mock.calls[0] as unknown[];
        const meta = callArgs[2] as Record<string, unknown>;
        expect(meta['request_id']).toBe('test-request-id');
        expect(meta['method']).toBe('GET');
        expect(meta['route']).toBe('/products');
        expect(meta['status_code']).toBe(200);
        expect(typeof meta['duration_ms']).toBe('number');
    });

    it('includes user_id when the request has an authenticated user', () => {
        const req = buildMockRequest({ user: { id: 'user-abc' } } as Partial<Request>);
        const res = buildMockResponse(200);
        const next = jest.fn();

        requestLogger(req, res, next);
        res.emit('finish');

        const callArgs = mockLog.mock.calls[0] as unknown[];
        const meta = callArgs[2] as Record<string, unknown>;
        expect(meta['user_id']).toBe('user-abc');
    });

    it('omits user_id for unauthenticated requests', () => {
        const req = buildMockRequest({ user: undefined });
        const res = buildMockResponse(200);
        const next = jest.fn();

        requestLogger(req, res, next);
        res.emit('finish');

        const callArgs = mockLog.mock.calls[0] as unknown[];
        const meta = callArgs[2] as Record<string, unknown>;
        expect(meta['user_id']).toBeUndefined();
    });

    it('does not log twice when finish fires more than once', () => {
        const req = buildMockRequest();
        const res = buildMockResponse(200);
        const next = jest.fn();

        requestLogger(req, res, next);
        res.emit('finish');
        res.emit('finish'); // second fire — should be ignored by `once`

        expect(mockLog).toHaveBeenCalledTimes(1);
    });
});
