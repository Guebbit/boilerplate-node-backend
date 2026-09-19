/**
 * @module
 * How hard the GENERATIVE suites push this machine.
 *
 * Every value here is a depth knob — how many cases a property explores, how many participants a
 * race fires. Turning one down trades rigour for time and memory, which is the trade a weak
 * machine has to make; turning one up is how you hunt something specific.
 *
 * Read off `process.env`, which `jest.config.js` has already filled from `.env`: it promotes an
 * allowlist of exactly these names in the main process, before any worker forks. Nothing under
 * `src/` reads them, so a knob changes what a suite ASKS, never what the code answers.
 *
 * See: docs/tools/property-testing.md, docs/tools/fuzz-testing.md
 */

import { positiveInteger } from '../../scripts/testing/machine-budget';

/**
 * One count knob, floored so a value cannot make the suite that reads it vacuous.
 *
 * Nonsense reads as unset rather than as zero — a typo produces the documented default instead of
 * a suite that runs no cases and reports green. The floor is the same argument one step further:
 * `numRuns: 0` and a race of one are both silently passing tests, so neither is reachable.
 *
 * @param name the environment variable to read
 * @param fallback the committed default, used when the knob is unset or unparseable
 * @param minimum the lowest value that still asks the question the suite exists to ask
 * @returns the resolved count, never below `minimum`
 */
export const countKnob = (name: string, fallback: number, minimum: number): number => {
    const parsed = positiveInteger(process.env[name]);
    return parsed === undefined ? fallback : Math.max(minimum, parsed);
};

/**
 * Requests the fuzz suite throws at EACH operation — `TEST_FUZZ_RUNS`.
 *
 * Deliberately small: 55 operations × this × a real in-memory Mongo, against auth limiters that
 * are raised but finite (`tests/support/setup.ts`). Raise it when hunting, not as a default.
 */
export const FUZZ_RUNS_PER_OPERATION = countKnob('TEST_FUZZ_RUNS', 12, 1);

/**
 * Cases per property over PURE functions — `TEST_PROPERTY_RUNS`.
 *
 * Cheap: no database, no HTTP, so this costs CPU and almost no memory. It is the last knob worth
 * turning on a machine that is short of RAM, and the first worth turning to make a run fit a
 * deadline.
 */
export const PROPERTY_RUNS = countKnob('TEST_PROPERTY_RUNS', 300, 10);

/**
 * Cases per property that drives a REAL database — `TEST_PROPERTY_RUNS_DB`.
 *
 * Its own knob, an order of magnitude below {@link PROPERTY_RUNS}, because one case here is a
 * sequence of writes against Mongo rather than a function call. Scaling both from one number
 * would size the expensive suite by the cheap one's budget.
 */
export const PROPERTY_RUNS_WITH_DATABASE = countKnob('TEST_PROPERTY_RUNS_DB', 40, 5);
