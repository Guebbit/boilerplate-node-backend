/**
 * The per-user SSE hub.
 *
 * Three things here are only observable from outside and each fails silently: the wire format (a
 * missing blank line makes every client buffer forever), routing (a frame must reach only the
 * user it is about), and teardown (a disconnect that leaves a timer or a map entry leaks for the
 * life of the process). The clock is faked and the response hand-built, so the bytes are exact.
 */
import { asStub } from '@tests/stub';
import type { Response } from 'express';
import {
    openStreamCount,
    publishToUser,
    streamNotifications
} from '@modules/notifications/services/stream';

/** The stream's heartbeat period, copied here so a change to it is noticed. */
const HEARTBEAT_INTERVAL_MS = 15_000;
/** How often the stream re-checks the caller's permission, copied here so a change is noticed. */
const REVERIFY_INTERVAL_MS = 30_000;

/** The slice of an Express response the stream writes to, with every write recorded. */
interface FakeResponse {
    /** The fake handed to the stream. */
    response: Response;
    /** Every string written, in order. */
    frames: string[];
    /** The headers set before the first write. */
    headers: Record<string, string>;
    /** Ends the stream; asserted directly when a recheck fails. */
    end: jest.Mock;
    /** Writes one frame. */
    write: jest.Mock;
    /** Sets the status. */
    status: jest.Mock;
    /** Sends the headers before any frame. */
    flushHeaders: jest.Mock;
    /** Simulates the client going away. */
    disconnect: () => void;
}

/** A `Response` with only the surface the hub touches, so the written bytes can be read back. */
const makeResponse = (): FakeResponse => {
    const frames: string[] = [];
    const headers: Record<string, string> = {};
    const closeHandlers: (() => void)[] = [];
    const end = jest.fn();
    const status = jest.fn();
    const flushHeaders = jest.fn();
    const write = jest.fn((frame: string) => {
        frames.push(frame);
        return true;
    });

    const response = asStub<Response>({
        status,
        flushHeaders,
        write,
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
        frames,
        headers,
        end,
        write,
        status,
        flushHeaders,
        disconnect: () => {
            for (const handler of closeHandlers) handler();
        }
    };
};

describe('the notifications stream', () => {
    let opened: FakeResponse[] = [];

    /** Opens a stream for `userId`; the recheck passes unless a test says otherwise. */
    const open = (
        userId: string,
        reverify: () => Promise<boolean> = () => Promise.resolve(true)
    ) => {
        const fake = makeResponse();
        streamNotifications(fake.response, userId, reverify);
        opened.push(fake);
        return fake;
    };

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        for (const fake of opened) fake.disconnect();
        opened = [];
        jest.useRealTimers();
    });

    it('opens as an event stream that no proxy may buffer', () => {
        const fake = open('user-1');

        expect(fake.headers['Content-Type']).toBe('text/event-stream');
        expect(fake.headers['Cache-Control']).toBe('no-store, no-transform');
        expect(fake.headers.Connection).toBe('keep-alive');
    });

    it('answers 200 and sends the headers at once, before any frame', () => {
        const fake = open('user-1');

        expect(fake.status).toHaveBeenCalledWith(200);
        expect(fake.flushHeaders).toHaveBeenCalledTimes(1);
        expect(fake.frames).toEqual([]);
    });

    it('writes a frame as event, data, and the blank line that ends it', () => {
        const fake = open('user-1');

        publishToUser('user-1', 'notifications.read', { readAt: '2026-10-04T10:00:00.000Z' });

        expect(fake.frames).toEqual([
            'event: notifications.read\ndata: {"readAt":"2026-10-04T10:00:00.000Z"}\n\n'
        ]);
    });

    it('reaches only the streams of the user it is about', () => {
        const mine = open('user-1');
        const myOtherTab = open('user-1');
        const someoneElse = open('user-2');

        publishToUser('user-1', 'notifications.deleted', { all: true, ids: [] });

        expect(mine.frames).toHaveLength(1);
        expect(myOtherTab.frames).toHaveLength(1);
        expect(someoneElse.frames).toEqual([]);
    });

    it('publishes to nobody without failing when the user has no open tab', () => {
        expect(() => {
            publishToUser('nobody', 'notifications.read', { readAt: 'now' });
        }).not.toThrow();
    });

    it('swallows a write to a socket the client already dropped', () => {
        const fake = open('user-1');
        fake.write.mockImplementationOnce(() => {
            throw new Error('write after end');
        });

        expect(() => {
            publishToUser('user-1', 'notifications.read', { readAt: 'now' });
        }).not.toThrow();
    });

    it('sends a keep-alive comment, not an event, so a client handles no heartbeat', () => {
        const fake = open('user-1');

        jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);

        expect(fake.frames).toEqual([': keep-alive\n\n']);
    });

    describe('teardown', () => {
        it('forgets the stream, and stops its timers, on disconnect', () => {
            const reverify = jest.fn(() => Promise.resolve(true));
            const fake = open('user-1', reverify);
            expect(openStreamCount()).toBe(1);

            fake.disconnect();
            jest.advanceTimersByTime(REVERIFY_INTERVAL_MS * 2);

            expect(openStreamCount()).toBe(0);
            expect(reverify).not.toHaveBeenCalled();
            expect(fake.frames).toEqual([]);
        });

        it('keeps the user entry while another of their tabs is open', () => {
            const first = open('user-1');
            const second = open('user-1');

            first.disconnect();
            publishToUser('user-1', 'notifications.read', { readAt: 'now' });

            expect(second.frames).toHaveLength(1);
            expect(openStreamCount()).toBe(1);
        });
    });

    describe('the permission recheck', () => {
        it('keeps the stream open while the caller still holds the key', async () => {
            const fake = open('user-1', () => Promise.resolve(true));

            await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS);

            expect(fake.end).not.toHaveBeenCalled();
            expect(openStreamCount()).toBe(1);
        });

        it('ends the stream once the caller no longer holds it', async () => {
            const fake = open('user-1', () => Promise.resolve(false));

            await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS);

            expect(fake.end).toHaveBeenCalledTimes(1);
            expect(openStreamCount()).toBe(0);
        });

        it('fails closed: a recheck that throws is not "still allowed"', async () => {
            const fake = open('user-1', () => Promise.reject(new Error('db down')));

            await jest.advanceTimersByTimeAsync(REVERIFY_INTERVAL_MS);

            expect(fake.end).toHaveBeenCalledTimes(1);
            expect(openStreamCount()).toBe(0);
        });
    });
});
