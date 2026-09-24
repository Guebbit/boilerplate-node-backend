/**
 * @module
 * A controlled wall clock for tests that also talk to a real Mongo.
 *
 * Why only `Date`: the driver keeps its own timers (heartbeats, socket timeouts, server selection),
 * and faking `setTimeout`/`setImmediate`/`nextTick` with the rest would freeze them and hang the
 * round trip. Moving `Date` alone is enough for every rule here, since they all read the clock in
 * JavaScript (`Date.now()`, `new Date()`) rather than asking the server for its time.
 */

/**
 * Every timer primitive jest's modern fake timers would otherwise replace — everything except
 * `Date`. https://jestjs.io/docs/jest-object#jestusefaketimersfaketimersconfig
 */
const REAL_TIMERS = [
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'setImmediate',
    'clearImmediate',
    'nextTick',
    'hrtime',
    'performance',
    'queueMicrotask'
] as const;

/**
 * Freezes `Date` at `at`, leaving every real timer running. Pair with `jest.useRealTimers()` in an
 * `afterEach` or a `finally`.
 *
 * @param at the instant `Date.now()` returns until the clock is moved again
 */
export const freezeDate = (at: number | Date = Date.now()): void => {
    // jest modern fake timers; `doNotFake` keeps the named primitives real.
    // https://jestjs.io/docs/jest-object#jestusefaketimersfaketimersconfig
    jest.useFakeTimers({ doNotFake: [...REAL_TIMERS] }).setSystemTime(at);
};

/**
 * Moves a clock frozen by {@link freezeDate} forward, without waiting and without firing timers.
 *
 * @param ms how far to move it
 */
export const advanceDate = (ms: number): void => {
    // jest.setSystemTime: sets the fake clock only; nothing scheduled runs.
    // https://jestjs.io/docs/jest-object#jestsetsystemtimenow-number--date
    jest.setSystemTime(Date.now() + ms);
};
