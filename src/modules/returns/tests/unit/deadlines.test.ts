/**
 * @module
 * The deadlines `returns` reads off an order: the withdrawal one moves to the instant the window
 * really closes (the announced day plus one silent UTC day), the guarantee one stays as frozen.
 */
import { ReturnReason } from '@types';
import { reasonsOpenAt } from '../../domain';
import { frozenDeadlinesOf } from '../../services/deadlines';

const ANNOUNCED = new Date('2026-03-15T23:59:59.999Z');
const GUARANTEE = new Date('2028-03-08T23:59:59.999Z');

describe('frozenDeadlinesOf', () => {
    it('moves the withdrawal deadline one UTC day past the announced last day', () => {
        const { withdrawUntil, conformityUntil } = frozenDeadlinesOf({
            withdrawUntil: ANNOUNCED,
            conformityUntil: GUARANTEE
        });

        expect(withdrawUntil?.toISOString()).toBe('2026-03-16T23:59:59.999Z');
        expect(conformityUntil).toBe(GUARANTEE);
    });

    it('leaves a clock that has not started without an end', () => {
        expect(frozenDeadlinesOf({}).withdrawUntil).toBeUndefined();
    });

    it('keeps the withdrawal reasons open through the grace day and shuts them after it', () => {
        const deadlines = frozenDeadlinesOf({
            withdrawUntil: ANNOUNCED,
            conformityUntil: GUARANTEE
        });
        const lastGraceInstant = new Date('2026-03-16T23:59:59.999Z');

        expect(reasonsOpenAt(deadlines, lastGraceInstant)).toContain(ReturnReason.withdrawal);
        expect(reasonsOpenAt(deadlines, new Date(lastGraceInstant.getTime() + 1))).toEqual([
            ReturnReason.defective,
            ReturnReason.wrong_item
        ]);
    });
});
