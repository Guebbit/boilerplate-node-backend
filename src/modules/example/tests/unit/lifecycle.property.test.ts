/**
 * @module
 * Property-based tests — `src/modules/example/domain/lifecycle.ts`. The event table is
 * private; what a caller sees is `canApply` and `exampleActionsFor`. These pin the invariants a
 * client leans on: an open event is always a legal one, no event stays put, and a caller who may
 * not edit is offered none. Seeded, so a counterexample found is
 * written back as an ordinary `it()`.
 */
import fc from 'fast-check';
import { PROPERTY_RUNS } from '@tests/knobs';
import { ExampleStatus } from '@types';
import { canApply, exampleActionsFor, statusAfter, type ExampleEvent } from '../../domain';

/** One seed for the file, and one place to change it; the count is `TEST_PROPERTY_RUNS`. */
const RUN = { seed: 20_261_022, numRuns: PROPERTY_RUNS, endOnFailure: true } as const;

/** Every lifecycle event. */
const EVENTS: readonly ExampleEvent[] = ['publish', 'archive', 'unarchive'];

/** Any status the example can hold. */
const anyStatus = () => fc.constantFrom(...Object.values(ExampleStatus));

/** What a caller's keys can say about one row. */
const anyPermits = () => fc.record({ update: fc.boolean(), delete: fc.boolean() });

describe('the lifecycle, over every status and every set of keys', () => {
    it('opens only events the lifecycle has from that status', () => {
        fc.assert(
            fc.property(anyStatus(), anyPermits(), (status, permits) => {
                const actions = exampleActionsFor(status, permits);
                for (const event of EVENTS)
                    if (actions[event]) expect(canApply(event, status)).toBe(true);
            }),
            RUN
        );
    });

    it('never opens an event that leaves the example where it is', () => {
        fc.assert(
            fc.property(anyStatus(), anyPermits(), (status, permits) => {
                const actions = exampleActionsFor(status, permits);
                for (const event of EVENTS)
                    if (actions[event]) expect(statusAfter(event)).not.toBe(status);
            }),
            RUN
        );
    });

    it('offers no event to a caller who may not edit', () => {
        fc.assert(
            fc.property(anyStatus(), fc.boolean(), (status, remove) => {
                const actions = exampleActionsFor(status, { update: false, delete: remove });
                expect([actions.publish, actions.archive, actions.unarchive]).toEqual([
                    false,
                    false,
                    false
                ]);
            }),
            RUN
        );
    });

    it('offers every event the lifecycle has to a caller who may edit', () => {
        fc.assert(
            fc.property(anyStatus(), fc.boolean(), (status, remove) => {
                const actions = exampleActionsFor(status, { update: true, delete: remove });
                for (const event of EVENTS) expect(actions[event]).toBe(canApply(event, status));
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
