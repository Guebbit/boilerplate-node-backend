import { nullPathsIn } from '@tests/response-contract';

describe('nullPathsIn', () => {
    it('finds nothing in a body without null', () => {
        expect(nullPathsIn({ a: 1, b: [{ c: '' }, 0, false], d: {} })).toEqual([]);
    });

    it('names a top-level null by its key', () => {
        expect(nullPathsIn({ a: null })).toEqual(['a']);
    });

    it('names a null inside a free-form object and inside an array', () => {
        expect(nullPathsIn({ items: [{ metadata: { changes: { x: { to: null } } } }] })).toEqual([
            'items.0.metadata.changes.x.to'
        ]);
    });

    it('names a body that is itself null', () => {
        expect(nullPathsIn(null)).toEqual(['(body)']);
    });
});
