/**
 * @module
 * Waiting out work already in flight at shutdown, with a ceiling — shared by every adapter that
 * must not exit mid-task (queue handlers, PDF renders).
 */

/**
 * Wait for every promise in `pending` to settle, or for `timeoutMs`, whichever comes first.
 *
 * @param pending - the work still running — the caller's live set, read once, now
 * @param timeoutMs - the most it may wait; hung work must not hold shutdown hostage
 * @returns resolves once everything settled or the time is up — never rejects
 */
export const settleWithin = (
    pending: ReadonlySet<Promise<unknown>>,
    timeoutMs: number
): Promise<void> => {
    if (pending.size === 0) return Promise.resolve();

    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        // Never, on its own, the thing keeping the process alive.
        // https://nodejs.org/api/timers.html#timeoutunref
        timer.unref();
    });
    return Promise.race([Promise.allSettled(pending).then(() => undefined), deadline]).finally(() =>
        clearTimeout(timer)
    );
};
