/**
 * @module
 * The retry backoff schedule and the auto-disable threshold — pure rules, so the sweep, the
 * worker and the unit tests share one table instead of three opinions about "how long until the
 * next try". See `docs/modules/webhooks.md`'s delayed-retry section: the granularity is the sweep
 * interval, so these numbers are the SHAPE of the backoff (short, then hours), not a promise of
 * precision.
 */

/**
 * Delay before each retry, in milliseconds, indexed by the attempt that just failed (1-based —
 * `WEBHOOK_RETRY_DELAYS_MS[0]` is the wait after attempt 1 fails). Reuses the exact tier values
 * the delayed-message-exchange ladder considered and rejected for it: 5s, 5m,
 * 30m, 2h, 10h — a reasonable spread from "the endpoint blipped" to "come back once whatever broke
 * has had most of a day to get fixed", even though decision (c) delivers it through `nextAttemptAt`
 * rather than five RabbitMQ queues.
 */
export const WEBHOOK_RETRY_DELAYS_MS: readonly number[] = [
    5000,
    5 * 60_000,
    30 * 60_000,
    2 * 3_600_000,
    10 * 3_600_000
];

/**
 * How many attempts a delivery gets in total — one initial try plus one per tier above.
 */
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length + 1;

/**
 * The delay before the next attempt, or `undefined` once every tier is spent — the signal to mark
 * the delivery `exhausted` instead of scheduling another row.
 *
 * @param failedAttempt - the attempt number that just failed (1-based)
 */
export const nextRetryDelayMs = (failedAttempt: number): number | undefined =>
    WEBHOOK_RETRY_DELAYS_MS[failedAttempt - 1];

/**
 * The wall-clock time of the next attempt after `failedAttempt` fails, or `undefined` once every
 * tier is spent — the value `repository.ts`'s retry-scheduling write stamps onto `nextAttemptAt`.
 *
 * @param failedAttempt - the attempt number that just failed (1-based)
 * @param now - injectable for tests; defaults to the real clock
 */
export const nextAttemptAt = (failedAttempt: number, now: Date = new Date()): Date | undefined => {
    const delay = nextRetryDelayMs(failedAttempt);
    return delay === undefined ? undefined : new Date(now.getTime() + delay);
};

/**
 * Consecutive EXHAUSTED events (a whole retry chain giving up, not one failed attempt) before a
 * subscription auto-disables. Reading "sustained failure" as a whole chain giving up, not one blip — five dead chains in
 * a row is long enough that a blip is not what is happening, and short enough that a genuinely
 * dead endpoint stops burning the queue within days rather than indefinitely.
 */
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 5;

/** Whether a subscription's failure streak has crossed the auto-disable line. */
export const shouldAutoDisable = (consecutiveFailures: number): boolean =>
    consecutiveFailures >= WEBHOOK_MAX_CONSECUTIVE_FAILURES;
