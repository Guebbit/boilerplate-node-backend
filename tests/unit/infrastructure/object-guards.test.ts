/**
 * `stripUndefined` drops `undefined` entries so an unspecified override falls through to the
 * schema's `default:`. Kept instead, the key exists with `undefined` as its value, which Mongoose
 * treats as "set to nothing" and the default never applies.
 */
import { fillOmittedWithNull, stripUndefined } from '@infrastructure/object-guards';

describe('stripUndefined', () => {
    it('drops keys whose value is undefined', () => {
        expect(stripUndefined({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
    });

    it('keeps null, zero, empty string and false', () => {
        // Each of these is a VALUE a factory may deliberately state — `shippingCost: 0` and
        // `active: false` both mean something. Only `undefined` means "not specified".
        expect(stripUndefined({ n: null, z: 0, s: '', f: false })).toEqual({
            n: null,
            z: 0,
            s: '',
            f: false
        });
    });

    it('returns an empty object when everything was unspecified', () => {
        expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
    });

    it('does not mutate its input', () => {
        const source = { a: 1, b: undefined };

        stripUndefined(source);

        expect(Object.keys(source)).toEqual(['a', 'b']);
    });
});

describe('fillOmittedWithNull', () => {
    it('leaves a present field alone', () => {
        expect(fillOmittedWithNull({ a: 1 }, ['a', 'b'])).toEqual({ a: 1, b: null });
    });

    it('fills every declared field that is absent, and only those', () => {
        expect(fillOmittedWithNull({}, ['a', 'b', 'c'])).toEqual({ a: null, b: null, c: null });
    });

    it('does not touch a field the schema never declared', () => {
        // A change-set is built from a VALIDATED body, so an undeclared key should not exist —
        // this pins that this helper does not itself introduce one.
        expect(fillOmittedWithNull({ extra: 'x' }, ['a'])).toEqual({ extra: 'x', a: null });
    });

    it('never mutates the body it was given', () => {
        const body = { a: 1 };
        fillOmittedWithNull(body, ['a', 'b']);
        expect(body).toEqual({ a: 1 });
    });
});
