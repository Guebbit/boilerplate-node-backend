/**
 * @module
 * Property-based tests — `src/modules/example/domain/lifecycle.ts`. The transition table is
 * private; what a caller sees is `statusesReachableFrom` and `exampleActionsFor`. These pin the
 * invariants a client leans on: a listed move is always a legal one, the current status is never
 * a move, and a caller who may not edit is offered none. Seeded, so a counterexample found is
 * written back as an ordinary `it()`.
 */
import fc from 'fast-check';
import { PROPERTY_RUNS } from '@tests/knobs';
import { ExampleStatus } from '@types';
import { canTransition, exampleActionsFor, statusesReachableFrom } from '../../domain';

/** One seed for the file, and one place to change it; the count is `TEST_PROPERTY_RUNS`. */
const RUN = { seed: 20_261_022, numRuns: PROPERTY_RUNS, endOnFailure: true } as const;

/** Any status the example can hold. */
const anyStatus = () => fc.constantFrom(...Object.values(ExampleStatus));

/** What a caller's keys can say about one row. */
const anyPermits = () => fc.record({ update: fc.boolean(), delete: fc.boolean() });

describe('the lifecycle, over every status and every set of keys', () => {
    it('never lists the current status as a move', () => {
        fc.assert(
            fc.property(anyStatus(), anyPermits(), (status, permits) => {
                expect(exampleActionsFor(status, permits).transitions).not.toContain(status);
            }),
            RUN
        );
    });

    it('lists only moves the lifecycle has, and only those reachable from the status', () => {
        fc.assert(
            fc.property(anyStatus(), anyPermits(), (status, permits) => {
                const { transitions } = exampleActionsFor(status, permits);
                for (const move of transitions) expect(canTransition(status, move)).toBe(true);
                expect(statusesReachableFrom(status)).toEqual(expect.arrayContaining(transitions));
            }),
            RUN
        );
    });

    it('offers no move to a caller who may not edit', () => {
        fc.assert(
            fc.property(anyStatus(), fc.boolean(), (status, remove) => {
                expect(
                    exampleActionsFor(status, { update: false, delete: remove }).transitions
                ).toEqual([]);
            }),
            RUN
        );
    });

    it('offers every reachable move to a caller who may edit', () => {
        fc.assert(
            fc.property(anyStatus(), fc.boolean(), (status, remove) => {
                expect(
                    exampleActionsFor(status, { update: true, delete: remove }).transitions
                ).toEqual([...statusesReachableFrom(status)]);
            }),
            RUN
        );
    });

    it('echoes the keys it was given, unchanged', () => {
        fc.assert(
            fc.property(anyStatus(), anyPermits(), (status, permits) => {
                const actions = exampleActionsFor(status, permits);
                expect([actions.update, actions.delete]).toEqual([permits.update, permits.delete]);
            }),
            RUN
        );
    });
});
