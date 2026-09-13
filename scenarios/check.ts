/**
 * @module
 * Hold a scenario's DECLARED guarantees (`src/kernel/registry.ts`'s `AppModule.scenario`) equal to
 * the SUBJECTS it actually offers — the id map `scenarios/index.ts`'s `buildScenario` returns and
 * `GET /__test/scenario` serves.
 *
 * Both directions, which is the point: a guarantee nobody pinned a row for is a promise the
 * backend cannot keep, and a subject no module declares is a name left behind after the module
 * that wanted it was deleted. Neither has any other guard —
 * `tests/integration/scenarios/shop.test.ts` runs this right after building the scenario, and
 * checks the rows themselves.
 */

import { enabledModules, type ModuleName } from '../src/modules';
import type { shopModules } from './index';

/**
 * Compile-time twin of the runtime checks below: every `shopModules` entry names a module this
 * build actually enables. A module seeding rows the app does not mount would write a collection
 * nothing serves, silently, since `scenarios/apply.ts` only ever walks the table it is given.
 *
 * `scenarios/index.ts` cannot hold this check itself — only this file, `apply.ts` and
 * `run-server.ts` may reach `src/modules.ts` (`eslint.config.ts`'s boundaries) — so it lives here,
 * beside the other guarantee this module holds. A `never` below is the compile error: TypeScript
 * names the offending key in the message, the same way an `Object.hasOwn` mismatch would have
 * named it at runtime, just before the build instead of after.
 */
type ShopModulesAreMounted = keyof typeof shopModules extends ModuleName ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- exists only to force the check above; never read
const shopModulesAreMounted: ShopModulesAreMounted = true;

/**
 * Every mismatch between what `scenarioName`'s modules declare and what `subjects` offers, one
 * line per problem — empty when the two agree exactly.
 *
 * Takes `subjects` as a parameter rather than building the scenario itself: this is a comparison
 * of two lists, and a checker that also had to seed a database could not be run against a
 * hand-made list to prove it catches anything.
 *
 * @param scenarioName - which scenario's guarantees to check, e.g. `'shop'`
 * @param subjects - guarantee name → row id, as `buildScenario` resolved it
 */
export const findUnmetGuarantees = (
    scenarioName: string,
    subjects: Readonly<Record<string, string>>
): string[] => {
    const declared = new Map<string, string>();
    for (const appModule of enabledModules)
        for (const guarantee of appModule.scenario?.[scenarioName] ?? [])
            declared.set(guarantee, appModule.name);

    const problems = [...declared]
        .filter(([guarantee]) => !Object.hasOwn(subjects, guarantee))
        .map(([guarantee, moduleName]) => `${moduleName}: ${guarantee} is declared but has no row`);

    return [
        ...problems,
        ...Object.keys(subjects)
            .filter((guarantee) => !declared.has(guarantee))
            .map((guarantee) => `${guarantee} is a subject no enabled module declares`)
    ];
};

/**
 * {@link findUnmetGuarantees}, thrown as one error naming every problem — the shape
 * `tests/integration/scenarios/shop.test.ts` wants: fail the test, don't hand back a list to check.
 *
 * @param scenarioName - which scenario's guarantees to check, e.g. `'shop'`
 * @param subjects - guarantee name → row id, as `buildScenario` resolved it
 * @throws {Error} listing every mismatch, when {@link findUnmetGuarantees} finds any
 */
export const assertScenarioGuarantees = (
    scenarioName: string,
    subjects: Readonly<Record<string, string>>
): void => {
    const problems = findUnmetGuarantees(scenarioName, subjects);
    if (problems.length > 0)
        throw new Error(
            `[scenario-check] ${scenarioName} guarantees not met:\n` +
                problems.map((problem) => `  ${problem}`).join('\n')
        );
};
