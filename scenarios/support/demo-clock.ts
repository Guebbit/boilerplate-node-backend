/**
 * @module
 * The demo profile's clock: a `Date`-only fake that time journeys move forward.
 *
 * Why only `Date`: the Mongo driver and Node keep their own timers (heartbeats, socket timeouts),
 * and faking those would freeze the round trips. Every rule a journey needs to age reads the
 * clock in JavaScript (`Date.now()`, `new Date()`), so moving `Date` is enough. It is the same
 * choice `tests/support/clock.ts` makes for jest.
 *
 * `shouldAdvanceTime` keeps the fake running at real speed between jumps, so nothing that
 * measures elapsed time sees a frozen world.
 *
 * Installed by `scenarios/run-server.ts` only — never by a deployment. The control surface
 * (`./demo`) reaches the clock through the slot below, so a test that mounts the routes directly
 * gets a clean "no clock" answer instead.
 */

import { install } from '@sinonjs/fake-timers';

/** A wall clock a spec may move forward, and put back. */
export interface DemoClock {
    /** The instant `Date.now()` currently answers. */
    now: () => Date;
    /** Milliseconds the clock is ahead of the real one (0 when it has not been moved). */
    offsetMs: () => number;
    /**
     * Move the clock forward. Never backward: a time-travel that could go back would let one spec
     * hand the next a session that has not started yet.
     *
     * @param ms - how far forward, in milliseconds; a non-negative, finite number
     */
    advance: (ms: number) => void;
    /** Put the clock back to real time. */
    reset: () => void;
}

/** The registered clock, or `undefined` when this process never installed one. */
let registered: DemoClock | undefined;

/**
 * Hand the control surface its clock. Called once, by `scenarios/run-server.ts`.
 *
 * @param clock - the clock to serve, or `undefined` to unregister (tests)
 */
export const registerDemoClock = (clock: DemoClock | undefined): void => {
    registered = clock;
};

/** The registered clock, or `undefined` when none is. */
export const getDemoClock = (): DemoClock | undefined => registered;

/**
 * The real wall clock, read from a source the fake does not touch. `performance` is not in
 * `toFake` below, so `timeOrigin + now()` keeps counting real time whatever `Date` says.
 */
const realNow = (): number => Math.round(performance.timeOrigin + performance.now());

/**
 * Fake `Date` and return the handle a spec moves it with.
 *
 * @returns the clock to register with `registerDemoClock`, plus `uninstall` to put the real
 *  `Date` back (a test's cleanup; the server never calls it)
 */
export const installDemoClock = (): DemoClock & { uninstall: () => void } => {
    /*
     * @sinonjs/fake-timers `install`: replaces the global with a controllable one.
     * - `toFake: ['Date']`: every other timer stays real (see the module header).
     * - `shouldAdvanceTime: true`: the fake keeps ticking with real time between jumps.
     * https://github.com/sinonjs/fake-timers#var-clock--faketimersinstallconfig
     */
    const clock = install({ now: realNow(), toFake: ['Date'], shouldAdvanceTime: true });

    return {
        uninstall: () => clock.uninstall(),
        now: () => new Date(clock.now),
        offsetMs: () => Math.max(0, clock.now - realNow()),
        advance: (ms) => {
            if (!Number.isFinite(ms) || ms < 0)
                throw new RangeError('the demo clock only moves forward');
            // `setSystemTime` shifts `Date` alone and fires no timer; there are none to fire.
            clock.setSystemTime(clock.now + ms);
        },
        reset: () => {
            clock.setSystemTime(realNow());
        }
    };
};
