/**
 * The shared SSE opener: headers, the fail-closed recheck and the run-once teardown.
 * The clock is faked and the response hand-built, so every timer and header is exact.
 */
import { asStub } from '@tests/stub';
import type { Response } from 'express';
import { openSseStream } from '@infrastructure/http/sse';
import { rejectResponse } from '@infrastructure/http/response';
import { rejectServiceUnavailable } from '@infrastructure/http/errors';
import { setEnvironment } from '@tests/environment';

/**
 * The refusals are built by the real response helpers elsewhere; here only which one is chosen,
 * and for whom, matters.
 */
jest.mock('@infrastructure/http/response', () => ({
    ...jest.requireActual('@infrastructure/http/response'),
    __esModule: true,
    rejectResponse: jest.fn()
}));
jest.mock('@infrastructure/http/errors', () => ({
    ...jest.requireActual('@infrastructure/http/errors'),
    __esModule: true,
    rejectServiceUnavailable: jest.fn()
}));

/** How often a stream re-checks the caller's permission, copied here so a change is noticed. */
const REVERIFY_INTERVAL_MS = 30_000;

/** Every response a test made, disconnected afterwards so the per-user counts start at zero. */
let made: { disconnect: () => void }[] = [];

/** A `Response` with only the surface the opener touches. */
const makeResponse = () => {
    const headers: Record<string, string> = {};
    const closeHandlers: (() => void)[] = [];
    const end = jest.fn();
    const status = jest.fn();
    const flushHeaders = jest.fn();
    const response = asStub<Response>({
        status,
        flushHeaders,
        end,
        setHeader: jest.fn((name: string, value: string) => {
            headers[name] = value;
        }),
        on: jest.fn((event: string, handler: () => void) => {
            if (event === 'close') closeHandlers.push(handler);
        })
    });
    const fake = {
        response,
        headers,
        end,
        status,
        flushHeaders,
        disconnect: () => {
            for (const handler of closeHandlers) handler();
        }
    };
    made.push(fake);
    return fake;
};

describe('openSseStream', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        for (const fake of made) fake.disconnect();
        made = [];
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('answers 200 with the event-stream headers and flushes them before any body', () => {
        const fake = makeResponse();

        openSseStream(fake.response, 'user-1', () => Promise.resolve(true));

        expect(fake.status).toHaveBeenCalledWith(200);
        expect(fake.headers).toEqual({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store, no-transform',
            Connection: 'keep-alive'
        });
        expect(fake.flushHeaders).toHaveBeenCalledTimes(1);
    });

    it('keeps the stream open while the caller still holds the key', async () => {
        const fake = makeResponse();
        const cleanup = jest.fn();
        openSseStream(fake.response, 'user-1', () => Promise.resolve(true))?.onClose(cleanup);

        await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS * 3);

        expect(fake.end).not.toHaveBeenCalled();
        expect(cleanup).not.toHaveBeenCalled();
    });

    it.each([
        ['says no', () => Promise.resolve(false)],
        ['rejects', () => Promise.reject(new Error('lookup failed'))]
    ])('ends the stream and cleans up once when the recheck %s', async (_name, reverify) => {
        const fake = makeResponse();
        const cleanup = jest.fn();
        openSseStream(fake.response, 'user-1', reverify)?.onClose(cleanup);

        await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS);
        // The socket closing after `end()` must not run the cleanup a second time.
        fake.disconnect();
        await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS * 2);

        expect(fake.end).toHaveBeenCalledTimes(1);
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('runs every cleanup on disconnect and stops rechecking', async () => {
        const fake = makeResponse();
        const reverify = jest.fn(() => Promise.resolve(true));
        const first = jest.fn();
        const second = jest.fn();
        const stream = openSseStream(fake.response, 'user-1', reverify);
        stream?.onClose(first);
        stream?.onClose(second);

        fake.disconnect();
        await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS * 2);

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        expect(reverify).not.toHaveBeenCalled();
    });

    describe('the stream caps', () => {
        it('refuses the open past the per-account cap with a 429 and sends no 200', () => {
            setEnvironment({ NODE_SSE_MAX_STREAMS_PER_USER: '2' });
            const [a, b, third] = [makeResponse(), makeResponse(), makeResponse()];
            openSseStream(a.response, 'user-1', () => Promise.resolve(true));
            openSseStream(b.response, 'user-1', () => Promise.resolve(true));

            const refused = openSseStream(third.response, 'user-1', () => Promise.resolve(true));

            expect(refused).toBeUndefined();
            expect(rejectResponse).toHaveBeenCalledWith(
                third.response,
                429,
                expect.arrayContaining([
                    expect.objectContaining({
                        code: 'RATE_LIMITED',
                        details: expect.objectContaining({ retryAfter: expect.any(Number) })
                    })
                ])
            );
            expect(third.status).not.toHaveBeenCalled();
            expect(third.flushHeaders).not.toHaveBeenCalled();
        });

        it('counts each account on its own', () => {
            setEnvironment({ NODE_SSE_MAX_STREAMS_PER_USER: '1' });
            openSseStream(makeResponse().response, 'user-1', () => Promise.resolve(true));

            const other = openSseStream(makeResponse().response, 'user-2', () =>
                Promise.resolve(true)
            );

            expect(other).toBeDefined();
        });

        it('answers 503 once the process holds its ceiling, whoever asks', () => {
            setEnvironment({ NODE_SSE_MAX_STREAMS: '1' });
            openSseStream(makeResponse().response, 'user-1', () => Promise.resolve(true));
            const full = makeResponse();

            const refused = openSseStream(full.response, 'user-2', () => Promise.resolve(true));

            expect(refused).toBeUndefined();
            expect(rejectServiceUnavailable).toHaveBeenCalledWith(full.response);
            expect(full.status).not.toHaveBeenCalled();
        });

        it('frees the slot when the client closes', () => {
            setEnvironment({ NODE_SSE_MAX_STREAMS_PER_USER: '1' });
            const first = makeResponse();
            openSseStream(first.response, 'user-1', () => Promise.resolve(true));

            first.disconnect();
            const again = openSseStream(makeResponse().response, 'user-1', () =>
                Promise.resolve(true)
            );

            expect(again).toBeDefined();
        });

        it('frees the slot when the recheck ends the stream, once', async () => {
            setEnvironment({ NODE_SSE_MAX_STREAMS_PER_USER: '1' });
            const first = makeResponse();
            openSseStream(first.response, 'user-1', () => Promise.resolve(false));

            await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS);
            // The close event after `end()` must not release a second slot.
            first.disconnect();
            const again = openSseStream(makeResponse().response, 'user-1', () =>
                Promise.resolve(true)
            );
            const over = openSseStream(makeResponse().response, 'user-1', () =>
                Promise.resolve(true)
            );

            expect(again).toBeDefined();
            expect(over).toBeUndefined();
        });
    });
});
