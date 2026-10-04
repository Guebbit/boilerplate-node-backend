/**
 * @module
 * A circuit breaker for the one shared Redis behind every rate-limit budget.
 *
 * Why:       without it, a dead Redis costs every request its full connect timeout (1 s) before the
 *            store error, on every budget, for as long as the outage lasts.
 * Shape:     closed (try Redis) -> a failure opens it for a fixed window -> after the window ONE
 *            request probes -> success closes it, failure re-opens it.
 * Why by hand: breaker libraries wrap a function call; `express-rate-limit`'s `Store` is an
 *            interface with four methods, and the state has to be shared across all of them.
 *
 * See: docs/tools/security.md#when-the-limits-redis-is-down
 */

/** A breaker's state machine, driven by whoever calls Redis. */
export interface Breaker {
    /**
     * Whether this call may try Redis. Closed: always. Open: never, until the window passes. After
     * it, exactly one caller gets `true` (the probe) and the rest keep getting `false` until the
     * probe reports back.
     */
    admit: () => boolean;

    /** The Redis call worked: close the breaker. */
    succeeded: () => void;

    /** The Redis call failed (or the probe did): open the breaker for a full window. */
    failed: () => void;
}

/**
 * Build one breaker.
 *
 * @param windowMs - how long it stays open after a failure before one probe is allowed
 * @param now - the clock, injectable so a test does not wait out the window
 */
export const createBreaker = (windowMs: number, now: () => number = Date.now): Breaker => {
    let openUntil = 0;
    let probing = false;

    return {
        admit: () => {
            if (openUntil === 0) return true;
            if (now() < openUntil || probing) return false;
            probing = true;
            return true;
        },
        succeeded: () => {
            openUntil = 0;
            probing = false;
        },
        failed: () => {
            openUntil = now() + windowMs;
            probing = false;
        }
    };
};
