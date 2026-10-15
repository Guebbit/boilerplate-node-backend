/**
 * The shared SSE opener: headers, the fail-closed recheck and the run-once teardown.
 * The clock is faked and the response hand-built, so every timer and header is exact.
 */
import { asStub } from '@tests/stub';
import type { Response } from 'express';
import { openSseStream } from '@infrastructure/http/sse';

const REVERIFY_INTERVAL_MS = 30_000;

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
    return {
        response,
        headers,
        end,
        status,
        flushHeaders,
        disconnect: () => {
            for (const handler of closeHandlers) handler();
        }
    };
};

describe('openSseStream', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('answers 200 with the event-stream headers and flushes them before any body', () => {
        const fake = makeResponse();

        openSseStream(fake.response, () => Promise.resolve(true));

        expect(fake.status).toHaveBeenCalledWith(200);
        expect(fake.headers).toEqual({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        });
        expect(fake.flushHeaders).toHaveBeenCalledTimes(1);
    });

    it('keeps the stream open while the caller still holds the key', async () => {
        const fake = makeResponse();
        const cleanup = jest.fn();
        openSseStream(fake.response, () => Promise.resolve(true)).onClose(cleanup);

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
        openSseStream(fake.response, reverify).onClose(cleanup);

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
        const stream = openSseStream(fake.response, reverify);
        stream.onClose(first);
        stream.onClose(second);

        fake.disconnect();
        await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS * 2);

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        expect(reverify).not.toHaveBeenCalled();
    });
});
