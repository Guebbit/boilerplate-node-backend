/**
 * @module
 * Waiting for a side effect the code under test deliberately does not await — a detached mail
 * enqueue, a fire-and-forget notice. Polls rather than sleeping a fixed time: it returns as soon as
 * the condition holds, so a fast machine pays nothing and a slow one has the whole window.
 */

/** Resolves after `ms` — the one pause the polling helpers below share. */
const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * Poll `done` until it is true or the window closes. Never throws: the assertion that follows is
 * what should fail, with its own message, not an opaque timeout here.
 *
 * @param done - the condition to wait for; may read a database
 * @param windowMs - how long to keep trying
 */
export const eventually = async (
    done: () => boolean | Promise<boolean>,
    windowMs = 3000
): Promise<void> => {
    const deadline = Date.now() + windowMs;
    while (!(await done()) && Date.now() < deadline) await pause(20);
};

/**
 * Run `attempt` until it resolves, retrying each rejection after `intervalMs` until `deadlineMs`
 * has passed; then the last rejection is rethrown. For a container or a socket that is not up yet,
 * where the failure of the final attempt is the message.
 *
 * @param attempt - one try
 * @param deadlineMs - how long to keep retrying
 * @param intervalMs - the pause between tries
 */
export const retryUntil = <T>(
    attempt: () => Promise<T>,
    deadlineMs: number,
    intervalMs: number
): Promise<T> => {
    const deadline = Date.now() + deadlineMs;

    const run = (): Promise<T> =>
        attempt().catch((error: unknown) => {
            if (Date.now() > deadline) throw error;
            return pause(intervalMs).then(run);
        });

    return run();
};
