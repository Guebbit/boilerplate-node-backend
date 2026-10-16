/**
 * @module
 * The scenario registry: every named, whole-database state this repo knows how to seed — `blank`,
 * plus each `scenarios/<name>.scenario.ts` file (`./scenarios.generated`). Every file in this folder
 * imports its
 * module's repository, model and factories directly (never the other way), so a production image
 * can omit this whole folder and nothing under `src/` notices.
 *
 * Walked by `support/demo.ts` and `scenarios/apply.ts` — neither of which imports a module for any
 * other reason. `./check.ts` holds a compile-time twin of the module registry, refusing a
 * `shopModules` entry whose name `enabledModules` does not also carry — this file cannot check
 * that itself, since only `apply.ts`/`run-server.ts`/`check.ts` may reach `src/modules.ts`
 * (`eslint.config.ts`'s boundaries).
 *
 * See: docs/tools/demo-profile.md
 */

import type { Express } from 'express';
import { seedBlank } from './blank';
import { scenarioFixtures } from './scenarios.generated';
import { withLoopbackServer } from './flows/loopback';
import { withoutHumanChallenge } from './support/no-human-challenge';
import type { SeedOutcome } from '@scenarios/seed';

export { shopModules } from './shop-modules';

/** One named, whole-database state: the rows it starts from, and the history it then lives. */
interface Scenario {
    /** Write the starting rows. Assumes an empty database — the caller owns emptying it. */
    seed: () => Promise<SeedOutcome[]>;

    /**
     * Drive the application until it has a past, against a base URL that is already listening.
     * Absent for a scenario with nothing to live through. Resolves the EXTRA subjects that drive
     * produced (an order id, say); a scenario that also backdates what it wrote does so inside
     * this function, before resolving.
     */
    drive?: (baseUrl: string) => Promise<Readonly<Record<string, string>>>;

    /** Guarantee name → row id, for the rows {@link Scenario.seed} pinned rather than produced. */
    subjects: Readonly<Record<string, string>>;
}

/**
 * The named, whole-database scenarios this repo can seed. `scenarios/apply.ts` and
 * `support/demo.ts` both index this instead of a hand-rolled ternary, so a new scenario is added
 * in exactly one place.
 */
const SCENARIOS = {
    ...scenarioFixtures,
    blank: { seed: seedBlank, subjects: {} }
} satisfies Record<string, Scenario>;

/** A name {@link SCENARIOS} actually knows how to seed. */
export type ScenarioName = keyof typeof SCENARIOS;

/**
 * Whether `name` is one {@link SCENARIOS} carries, narrowing it to {@link ScenarioName}.
 *
 * The registry owns this rather than each caller repeating `Object.hasOwn` and then casting: a
 * bare `Object.hasOwn` narrows the TABLE, never the string handed in, so every caller that skipped
 * this needed an `as ScenarioName` to say what it had already proved. Stated once, as a type
 * guard, the callers need no cast at all.
 *
 * @param name - an unvalidated scenario name, from argv or a request body
 */
export const isScenarioName = (name: string): name is ScenarioName =>
    Object.hasOwn(SCENARIOS, name);

/**
 * `preferred` when {@link SCENARIOS} carries it, else `blank`.
 * @param preferred - the scenario a deployment with a catalogue is demonstrated with
 */
const scenarioOr = (preferred: string): ScenarioName =>
    isScenarioName(preferred) ? preferred : 'blank';

/**
 * The scenario every caller falls back to when none was named: `shop` while the repo carries one
 * (a demo of an ecommerce boilerplate with no catalogue in it demonstrates nothing), else `blank`.
 * Derived, so deleting the shop scenario needs no edit here.
 */
export const DEFAULT_SCENARIO: ScenarioName = scenarioOr('shop');

/**
 * Seed a scenario into the CURRENTLY EMPTY database and, where it has one, live its history:
 * drive the real flows against a throwaway loopback listener.
 *
 * One function rather than two exported steps because they have exactly one legitimate order:
 * nothing can be driven before the rows exist.
 *
 * @param name - which scenario
 * @param app - the Express application, for the loopback listener the flows are driven against.
 *              Optional: a scenario with no history to live needs no app at all, which is what
 *              lets `blank` be built by a caller that has not assembled one
 * @returns every subject the scenario offers — its pinned ids merged with the flow-produced ones
 * @throws {Error} when the scenario has flows to drive and no app was given
 */
export const buildScenario = (
    name: ScenarioName,
    app?: Express
): Promise<Readonly<Record<string, string>>> => {
    const { seed, drive, subjects }: Scenario = SCENARIOS[name];

    if (drive && !app)
        throw new Error(`scenario "${name}" lives its history over HTTP and needs the Express app`);

    return (
        seed()
            // The flows are a script: they can solve no human challenge, so the provider is off while they run.
            .then(() =>
                drive && app ? withoutHumanChallenge(() => withLoopbackServer(app, drive)) : {}
            )
            .then((extra) => ({ ...subjects, ...extra }))
    );
};
