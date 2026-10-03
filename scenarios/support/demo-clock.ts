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
 * Installed by `scenarios/run-server.ts` only — never by a deployment, and never before the
 * process has the demo profile on.
 */

import { install } from '@sinonjs/fake-timers';
import type { DemoClock } from '@infrastructure/runtime/demo-clock';

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
