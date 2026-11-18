/**
 * @module
 * A held Server-Sent Events stream for the multi-copy cases: opened on one copy, read as text, and
 * waited on for a named event. Plain `fetch`, since the point is what a copy puts on the wire.
 *
 * @see docs/build/replicas-testing.md#the-multi-copy-suite
 */
import { retryUntil } from '@tests/eventually';

/** An open stream: what it has received so far, and the way to end it. */
export interface HeldStream {
    /** Everything received so far, as one string. */
    received: () => string;
    /** Resolves once a frame named `event` has arrived, or rejects after `timeoutMs`. */
    waitForEvent: (event: string, timeoutMs: number) => Promise<void>;
    /** Closes the connection. */
    close: () => Promise<void>;
}

/**
 * Opens `/notifications/stream` on `base` with the session `cookie` and keeps reading it.
 *
 * @param base - base URL of ONE copy: a stream is held by the copy that accepted it
 * @param cookie - the `Cookie` header of a logged-in session
 * @throws {Error} when the copy does not answer 200
 */
export const openNotificationStream = (base: string, cookie: string): Promise<HeldStream> => {
    const abort = new AbortController();
    let text = '';

    return fetch(`${base}/notifications/stream`, {
        headers: { cookie },
        signal: abort.signal
    }).then((response) => {
        if (response.status !== 200 || !response.body)
            throw new Error(`The stream answered ${String(response.status)}, expected 200`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const reading = (function pump(): Promise<void> {
            return reader.read().then(({ done, value }) => {
                if (done) return undefined;
                text += decoder.decode(value, { stream: true });
                return pump();
            });
        })().catch(() => undefined);

        return {
            received: () => text,
            waitForEvent: (event, timeoutMs) =>
                retryUntil(
                    () =>
                        text.includes(`event: ${event}\n`)
                            ? Promise.resolve()
                            : Promise.reject(new Error(`no ${event} frame yet; got: ${text}`)),
                    timeoutMs,
                    50
                ),
            close: () => {
                abort.abort();
                return reading;
            }
        };
    });
};
