/**
 * The SSE metrics stream.
 *
 * This was one of two honest zeros in the mutation report: a suite could reach it and
 * none did. Three things here are only observable from outside the module, and each fails silently:
 *
 *   - **The wire format.** `event:`/`data:` and the blank line that ends a frame are
 *     whitespace-significant. Drop the trailing newline and every client buffers forever while the
 *     server looks healthy.
 *   - **Teardown.** A disconnect that does not clear both intervals leaves timers writing to a dead
 *     socket for the life of the process, and a `Set` entry that is never deleted pins the whole
 *     `Response` in memory. Neither shows up as an error anywhere.
 *   - **Error absorption.** A rejected metrics read, or a `write()` to a socket the client already
 *     dropped, must not escape an interval callback — an unhandled rejection there takes the
 *     process down.
 *
 * `getHttpRequestCounters` is mocked and the clock is faked, so the frames are deterministic.
 */
import type { Response } from 'express';

const getHttpRequestCounters = jest.fn(() =>
    Promise.resolve({ totalRequests: 10, totalErrors: 2 })
);

jest.mock('@infrastructure/observability/metrics-http', () => ({
    getHttpRequestCounters: () => getHttpRequestCounters()
}));

import {
    buildObservabilityPayload,
    getActiveSseClients,
    streamObservabilityMetrics
} from '@infrastructure/observability/stream';

/** The intervals the module schedules, as documented in its own constants. */
const UPDATE_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15_000;

interface FakeResponse {
    response: Response;
    /** Every string handed to `write`, in order. */
    frames: string[];
    headers: Record<string, string>;
    status: jest.Mock;
    flushHeaders: jest.Mock;
    write: jest.Mock;
    /** Fires the `close` handler the module registered, as a real disconnect would. */
    disconnect: () => void;
}

/**
 * A `Response` with only the surface this module touches.
 *
 * Hand-built rather than a real Express response: the point is to read the exact bytes written and
 * to fire `close` on demand, neither of which a real socket makes easy.
 */
const makeResponse = (): FakeResponse => {
    const frames: string[] = [];
    const headers: Record<string, string> = {};
    const closeHandlers: (() => void)[] = [];

    const status = jest.fn();
    const flushHeaders = jest.fn();
    const write = jest.fn((frame: string) => {
        frames.push(frame);
        return true;
    });

    const response = {
        status,
        flushHeaders,
        write,
        setHeader: jest.fn((name: string, value: string) => {
            headers[name] = value;
        }),
        on: jest.fn((event: string, handler: () => void) => {
            if (event === 'close') closeHandlers.push(handler);
        })
    } as unknown as Response;

    return {
        response,
        frames,
        headers,
        status,
        flushHeaders,
        write,
        disconnect: () => {
            for (const handler of closeHandlers) handler();
        }
    };
};

/** A written frame, split back into the parts the SSE format defines. */
const parseFrame = (frame: string) => {
    const [eventLine, dataLine, ...rest] = frame.split('\n');
    return {
        event: eventLine?.replace('event: ', ''),
        payload: JSON.parse(dataLine?.replace('data: ', '') ?? '{}') as Record<string, unknown>,
        /** The frame terminator: two newlines mean two empty strings after the data line. */
        terminator: rest
    };
};

describe('the SSE metrics stream', () => {
    /** Responses opened by a test, disconnected afterwards so the module-level Set starts empty. */
    let opened: FakeResponse[] = [];

    const open = () => {
        const fake = makeResponse();
        streamObservabilityMetrics(fake.response);
        opened.push(fake);
        return fake;
    };

    beforeEach(() => {
        jest.useFakeTimers();
        getHttpRequestCounters.mockImplementation(() =>
            Promise.resolve({ totalRequests: 10, totalErrors: 2 })
        );
    });

    afterEach(() => {
        for (const fake of opened) fake.disconnect();
        opened = [];
        jest.useRealTimers();
    });

    describe('buildObservabilityPayload', () => {
        it('reports memory, http counters and connection count in one frame', async () => {
            jest.spyOn(process, 'memoryUsage').mockReturnValue({
                rss: 100,
                heapUsed: 40,
                heapTotal: 60,
                external: 5,
                arrayBuffers: 1
            });

            const payload = await buildObservabilityPayload();

            expect(payload.memory).toEqual({ rss: 100, heapUsed: 40, heapTotal: 60, external: 5 });
            expect(payload.http).toEqual({ totalRequests: 10, totalErrors: 2 });
            expect(payload.realtime).toEqual({ sseClients: 0 });
        });

        it('stamps an ISO-8601 timestamp, so the client can compute its own skew', async () => {
            const { timestamp } = await buildObservabilityPayload();

            expect(timestamp).toBe(new Date(timestamp).toISOString());
        });

        it('floors uptime to whole seconds, like every other payload that publishes it', async () => {
            /*
             * Floor rather than round, and that is the whole point of the shared reader in
             * `infrastructure/observability/process-snapshot.ts`. A dashboard shows this frame
             * beside `GET /observability/health`; while this one rounded and that one floored, the
             * two reported uptimes a second apart with nothing wrong in either.
             */
            jest.spyOn(process, 'uptime').mockReturnValue(12.7);

            await expect(buildObservabilityPayload()).resolves.toMatchObject({ uptimeSeconds: 12 });
        });
    });

    describe('getActiveSseClients', () => {
        it('counts one entry per open stream and releases it on disconnect', () => {
            expect(getActiveSseClients()).toBe(0);

            const first = open();
            const second = open();
            expect(getActiveSseClients()).toBe(2);

            first.disconnect();
            expect(getActiveSseClients()).toBe(1);

            second.disconnect();
            expect(getActiveSseClients()).toBe(0);
        });

        it('is reported inside the payload the connections themselves feed', async () => {
            open();

            await expect(buildObservabilityPayload()).resolves.toMatchObject({
                realtime: { sseClients: 1 }
            });
        });
    });

    describe('opening a stream', () => {
        it('answers 200 with the headers that make a response an SSE stream', () => {
            const fake = open();

            expect(fake.status).toHaveBeenCalledWith(200);
            expect(fake.headers).toEqual({
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive'
            });
        });

        it('flushes the headers immediately, rather than leaving the client waiting', () => {
            const fake = open();

            expect(fake.flushHeaders).toHaveBeenCalledTimes(1);
        });

        it('sends a snapshot at once, so the dashboard is not blank until the first interval', async () => {
            const fake = open();

            await jest.advanceTimersByTimeAsync(0);

            expect(fake.frames).toHaveLength(1);
            expect(parseFrame(fake.frames[0]!).event).toBe('observability.metrics.snapshot');
        });

        it('writes a frame the SSE format actually terminates', async () => {
            const fake = open();
            await jest.advanceTimersByTimeAsync(0);

            const frame = fake.frames[0]!;

            expect(frame.startsWith('event: ')).toBe(true);
            expect(frame).toContain('\ndata: ');
            // The blank line IS the frame boundary; without it the client buffers indefinitely
            expect(frame.endsWith('\n\n')).toBe(true);
            expect(parseFrame(frame).terminator).toEqual(['', '']);
        });

        it('keeps each payload on one line, as the data field requires', async () => {
            const fake = open();
            await jest.advanceTimersByTimeAsync(0);

            const [, dataLine] = fake.frames[0]!.split('\n');

            expect(dataLine).toBeDefined();
            expect(dataLine).not.toContain('\n');
            expect(() => JSON.parse(dataLine!.replace('data: ', ''))).not.toThrow();
        });
    });

    describe('the two timers', () => {
        it('pushes an update every five seconds', async () => {
            const fake = open();
            await jest.advanceTimersByTimeAsync(0);

            await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);

            expect(fake.frames.map((frame) => parseFrame(frame).event)).toEqual([
                'observability.metrics.snapshot',
                'observability.metrics.updated'
            ]);
        });

        it('does not push an update before the interval elapses', async () => {
            const fake = open();
            await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS - 1);

            expect(fake.frames).toHaveLength(1);
        });

        it('heartbeats on its own slower timer', async () => {
            const fake = open();
            await jest.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

            const events = fake.frames.map((frame) => parseFrame(frame).event);

            // 15s is three update ticks and one heartbeat, on two independent timers
            expect(events.filter((event) => event === 'observability.heartbeat')).toHaveLength(1);
            expect(
                events.filter((event) => event === 'observability.metrics.updated')
            ).toHaveLength(3);
        });
    });

    describe('teardown', () => {
        it('stops both timers when the client disconnects', async () => {
            const fake = open();
            await jest.advanceTimersByTimeAsync(0);
            const writtenBeforeClose = fake.frames.length;

            fake.disconnect();
            await jest.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);

            // Uncleared intervals would write to a dead socket for the life of the process
            expect(fake.frames).toHaveLength(writtenBeforeClose);
        });

        it('leaves the other clients streaming', async () => {
            const first = open();
            const second = open();
            await jest.advanceTimersByTimeAsync(0);

            first.disconnect();
            await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);

            expect(first.frames).toHaveLength(1);
            expect(second.frames).toHaveLength(2);
            expect(getActiveSseClients()).toBe(1);
        });
    });

    describe('failures that must not escape', () => {
        it('drops a frame rather than rejecting when the metrics read fails', async () => {
            getHttpRequestCounters.mockRejectedValueOnce(new Error('registry down'));
            const fake = open();

            await expect(jest.advanceTimersByTimeAsync(0)).resolves.toBeUndefined();
            expect(fake.frames).toHaveLength(0);
        });

        it('recovers on the next tick after a failed read', async () => {
            getHttpRequestCounters.mockRejectedValueOnce(new Error('registry down'));
            const fake = open();
            await jest.advanceTimersByTimeAsync(0);

            await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);

            expect(fake.frames.map((frame) => parseFrame(frame).event)).toEqual([
                'observability.metrics.updated'
            ]);
        });

        it('survives a write to a socket the client already dropped', async () => {
            const fake = open();
            fake.write.mockImplementationOnce(() => {
                throw new Error('EPIPE');
            });

            await expect(jest.advanceTimersByTimeAsync(0)).resolves.toBeUndefined();
            expect(fake.frames).toHaveLength(0);
        });
    });
});
