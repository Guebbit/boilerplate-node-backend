/**
 * `scenarios/check.ts` — the comparison that holds every module's declared `scenario.shop`
 * guarantees equal to the subject map a built scenario actually offers.
 *
 * No database: the checker compares two lists and nothing else, which is exactly what lets these
 * cases feed it a hand-made map and prove it catches something. Whether the real `shop` satisfies
 * the real declarations is `tests/integration/scenarios/shop.test.ts`'s job — it has to build the
 * scenario to find out.
 */

import { findUnmetGuarantees, assertScenarioGuarantees } from '@scenarios/check';
import { enabledModules } from '../../../src/modules';

/** Every guarantee name the enabled modules declare for `shop` — read, never restated. */
const declaredForShop = enabledModules.flatMap((appModule) => appModule.scenario?.shop ?? []);

/** A subject map that satisfies every declaration, each name pointing at a stand-in id. */
const satisfyingSubjects = Object.fromEntries(
    declaredForShop.map((guarantee) => [guarantee, '65dc8a99604c307b702b5ccc'])
);

describe('findUnmetGuarantees', () => {
    it('reports every declared guarantee when the scenario offers no subjects at all', () => {
        const problems = findUnmetGuarantees('shop', {});

        expect(problems).toHaveLength(declaredForShop.length);
        for (const guarantee of declaredForShop)
            expect(problems).toContainEqual(expect.stringContaining(guarantee));
    });

    it('finds nothing to report when the two lists agree exactly', () => {
        expect(findUnmetGuarantees('shop', satisfyingSubjects)).toEqual([]);
    });

    it('reports a subject no enabled module declares — a name left behind', () => {
        const problems = findUnmetGuarantees('shop', {
            ...satisfyingSubjects,
            'ghost.leftBehind': '65dc8a99604c307b702b5ccc'
        });

        expect(problems).toEqual(['ghost.leftBehind is a subject no enabled module declares']);
    });

    it('reports nothing for a scenario no module declares anything for', () => {
        expect(findUnmetGuarantees('blank', {})).toEqual([]);
    });
});

describe('assertScenarioGuarantees', () => {
    it('throws one error naming every problem', () => {
        expect(() => assertScenarioGuarantees('shop', {})).toThrow(
            /\[scenario-check] shop guarantees not met/
        );
    });

    it('returns quietly when the two lists agree', () => {
        expect(() => assertScenarioGuarantees('shop', satisfyingSubjects)).not.toThrow();
    });
});
