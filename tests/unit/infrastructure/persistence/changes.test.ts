/**
 * `clearedOrValue` — the one fact every module's `update()` depends on to turn a change-set's
 * `null` into `$unset` on save.
 */
import { clearedOrValue, setAndUnset } from '@infrastructure/persistence/changes';

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

describe('setAndUnset', () => {
    it('sets a value and unsets an undefined one', () => {
        expect(setAndUnset({ status: 'paid', note: undefined })).toEqual({
            $set: { status: 'paid' },
            $unset: { note: 1 }
        });
    });

    it('keeps falsy values on the set side — only undefined clears', () => {
        expect(setAndUnset({ count: 0, flag: false, text: '', gone: null })).toEqual({
            $set: { count: 0, flag: false, text: '', gone: null }
        });
    });

    it('leaves out an empty half, which Mongo would refuse', () => {
        expect(setAndUnset({ a: undefined })).toEqual({ $unset: { a: 1 } });
        expect(setAndUnset({})).toEqual({});
    });
});
