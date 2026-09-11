/**
 * @module
 * Assert every module's declared `scenario` guarantees (`src/kernel/registry.ts`'s
 * `AppModule.scenario`) actually hold in whatever database is currently seeded. Called by
 * `scenarios/build/export-dataset.ts` right after seeding, so a guarantee that stops being true
 * fails the build loudly instead of drifting silently.
 */

import { enabledModules } from '../src/modules';
import { demoModules, type DemoModule } from './index';

/**
 * `demoModules[name]` for a name that may not be one of its keys — `demoModules` is declared as
 * `Record<string, DemoModule>` (this repo runs with `noUncheckedIndexedAccess` off), so an index
 * access alone types as always-present even though most modules have no entry at all.
 */
const demoModuleFor = (name: string): DemoModule | undefined =>
    Object.hasOwn(demoModules, name) ? demoModules[name] : undefined;

/**
 * Every guarantee `scenarioName` fails to hold, one line per problem — empty when everything
 * declared is actually satisfied.
 *
 * Two distinct ways a module can show up here: declaring a guarantee `scenarios/index.ts` has no
 * `checkGuarantees` registered for at all (nothing can verify the claim), or a `checkGuarantees`
 * call that comes back without a key the manifest declares (the state stopped being seeded).
 *
 * @param scenarioName - which scenario's guarantees to check, e.g. `'shop'`
 */
export const findUnmetGuarantees = async (scenarioName: string): Promise<string[]> => {
    const problems: string[] = [];

    for (const appModule of enabledModules) {
        const declared = appModule.scenario?.[scenarioName];
        if (!declared || declared.length === 0) continue;

        const checkGuarantees = demoModuleFor(appModule.name)?.checkGuarantees;
        if (!checkGuarantees) {
            problems.push(
                `${appModule.name} declares ${scenarioName} guarantees but scenarios/index.ts ` +
                    `has no checkGuarantees registered for it`
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
 * `scenarios/build/export-dataset.ts` wants: fail the run, don't hand back a list to check.
 *
 * @throws {Error} listing every unmet guarantee, when {@link findUnmetGuarantees} finds any
 */
export const assertScenarioGuarantees = async (scenarioName: string): Promise<void> => {
    const problems = await findUnmetGuarantees(scenarioName);
    if (problems.length > 0)
        throw new Error(
            `[scenario-check] ${scenarioName} guarantees not met:\n` +
                problems.map((problem) => `  ${problem}`).join('\n')
        );
};
