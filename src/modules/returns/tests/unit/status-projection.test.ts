/**
 * @module
 * Where the returns on an order stand, as the one word the order shows.
 */
import { projectReturnStatus } from '../../domain';
import type { ProjectedReturn } from '../../domain';

const ordered = new Map([
    ['a', 2],
    ['b', 1]
]);

/** A return with the given status over the given lines. */
const ret = (status: ProjectedReturn['status'], lines: [string, number][]): ProjectedReturn => ({
    status,
    lines: lines.map(([productId, quantity]) => ({ productId, quantity }))
});

describe('projectReturnStatus', () => {
    it('is nothing when there are no returns', () => {
        expect(projectReturnStatus([], ordered)).toBeUndefined();
    });

    it('ignores a declined return — it holds no goods', () => {
        expect(projectReturnStatus([ret('declined', [['a', 2]])], ordered)).toBeUndefined();
    });

    it('shows a request awaiting staff before anything else', () => {
        expect(
            projectReturnStatus(
                [ret('approved', [['a', 1]]), ret('requested', [['b', 1]])],
                ordered
            )
        ).toBe('requested');
    });

    it('shows goods approved and awaited', () => {
        expect(projectReturnStatus([ret('approved', [['a', 2]])], ordered)).toBe('in_progress');
    });

    it('is partially returned while some units are still out', () => {
        expect(projectReturnStatus([ret('closed', [['a', 2]])], ordered)).toBe(
            'partially_returned'
        );
    });

    it('is returned once every unit is covered, across returns', () => {
        expect(
            projectReturnStatus([ret('received', [['a', 2]]), ret('closed', [['b', 1]])], ordered)
        ).toBe('returned');
    });
});
