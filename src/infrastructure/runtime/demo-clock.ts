/**
 * @module
 * The demo profile's movable clock, as the control surface sees it: an interface and a slot.
 *
 * The implementation (a `Date`-only fake) lives in `scenarios/support/demo-clock.ts`, because it
 * needs a dev dependency that a production image does not carry. `src/app/demo.ts` reaches it
 * through here, so nothing under `src/` imports that package.
 *
 * Empty unless `scenarios/run-server.ts` registers one — a test that mounts the demo routes
 * directly gets a clean "no clock" answer instead.
 */

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
