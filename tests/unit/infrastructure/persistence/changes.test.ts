/**
 * `clearedOrValue` — the one fact every module's `update()` depends on to turn a change-set's
 * `null` into `$unset` on save.
 */
import { clearedOrValue } from '@infrastructure/persistence/changes';

describe('clearedOrValue', () => {
    it('turns null into undefined, for $unset on save', () => {
        expect(clearedOrValue(null)).toBeUndefined();
    });

    it('leaves every other value exactly as it was', () => {
        expect(clearedOrValue('x')).toBe('x');
        expect(clearedOrValue(0)).toBe(0);
        expect(clearedOrValue(false)).toBe(false);
    });
});
