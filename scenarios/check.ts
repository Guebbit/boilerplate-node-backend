/**
 * @module
 * Assert every module's declared `scenario` guarantees (`src/kernel/registry.ts`'s
 * `AppModule.scenario`) actually hold in whatever database is currently seeded. Called by
 * `tests/integration/scenarios/shop.test.ts` right after seeding, so a guarantee that stops being
 * true fails the test suite loudly instead of drifting silently.
 */

import { enabledModules } from '../src/modules';
import type { ScenarioModule } from './index';

/**
 * Every guarantee `scenarioName` fails to hold, one line per problem — empty when everything
 * declared is actually satisfied.
 *
 * Two distinct ways a module can show up here: declaring a guarantee `modules` has no
 * `checkGuarantees` registered for at all (nothing can verify the claim), or a `checkGuarantees`
 * call that comes back without a key the manifest declares (the state stopped being seeded).
 *
 * Takes `modules` as a parameter, rather than reading `scenarios/index.ts`'s `shopModules`
 * directly, so a caller can exercise the "nothing registered" branch with an empty table.
 *
 * @param scenarioName - which scenario's guarantees to check, e.g. `'shop'`
 * @param modules - the scenario's module table — `shopModules` for `'shop'`
 */
export const findUnmetGuarantees = async (
    scenarioName: string,
    modules: Readonly<Record<string, Pick<ScenarioModule, 'checkGuarantees'>>>
): Promise<string[]> => {
    const problems: string[] = [];

    for (const appModule of enabledModules) {
        const declared = appModule.scenario?.[scenarioName];
        if (!declared || declared.length === 0) continue;

        // `modules` is declared as `Record<string, ...>` (this repo runs with
        // `noUncheckedIndexedAccess` off), so an index access alone types as always-present even
        // though most modules have no entry at all — `Object.hasOwn` narrows it back.
        const checkGuarantees = Object.hasOwn(modules, appModule.name)
            ? modules[appModule.name].checkGuarantees
            : undefined;
        if (!checkGuarantees) {
            problems.push(
                `${appModule.name} declares ${scenarioName} guarantees but its scenario module ` +
                    `table has no checkGuarantees registered for it`
            );
            continue;
        }

        const satisfied = new Set(await checkGuarantees());
        for (const guarantee of declared)
            if (!satisfied.has(guarantee))
                problems.push(`${appModule.name}: ${guarantee} is declared but not seeded`);
    }

    return problems;
};

/**
 * {@link findUnmetGuarantees}, thrown as one error naming every problem — the shape
 * `tests/integration/scenarios/shop.test.ts` wants: fail the test, don't hand back a list to check.
 *
 * @param scenarioName - which scenario's guarantees to check, e.g. `'shop'`
 * @param modules - the scenario's module table — `shopModules` for `'shop'`
 * @throws {Error} listing every unmet guarantee, when {@link findUnmetGuarantees} finds any
 */
export const assertScenarioGuarantees = async (
    scenarioName: string,
    modules: Readonly<Record<string, Pick<ScenarioModule, 'checkGuarantees'>>>
): Promise<void> => {
    const problems = await findUnmetGuarantees(scenarioName, modules);
    if (problems.length > 0)
        throw new Error(
            `[scenario-check] ${scenarioName} guarantees not met:\n` +
                problems.map((problem) => `  ${problem}`).join('\n')
        );
};
