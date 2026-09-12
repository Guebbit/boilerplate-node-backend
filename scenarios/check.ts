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

import { enabledModules } from '../src/modules';

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
