/**
 * `extends-map` — the one reading of a fragment's `x-extends`, shared by the OpenAPI and AsyncAPI
 * bundlers. Driven with plain values: the property under test is what is refused, and the message.
 */

import { parseExtendsMap, requireDeclared } from '../../../../scripts/contracts/extends-map';

describe('parseExtendsMap', () => {
    it('returns a map of non-empty string lists as it is', () => {
        expect(parseExtendsMap({ Kind: ['a', 'b'], Union: ['C'] }, 'frag')).toEqual({
            Kind: ['a', 'b'],
            Union: ['C']
        });
    });

    it.each([
        ['a scalar', 'oops', /x-extends must be a map/],
        ['a list', ['a'], /x-extends must be a map/],
        ['null', null, /x-extends must be a map/],
        ['a value that is not a list', { Kind: 'a' }, /x-extends Kind must be a list of strings/],
        ['a list of non-strings', { Kind: [1] }, /x-extends Kind must be a list of strings/],
        ['an empty list', { Kind: [] }, /x-extends Kind is an empty list/],
        ['a repeated entry', { Kind: ['a', 'a'] }, /x-extends Kind names the same entry twice/]
    ])('refuses %s', (_label, declared, message) => {
        expect(() => parseExtendsMap(declared, 'frag')).toThrow(message);
    });
});

describe('requireDeclared', () => {
    it('accepts names the fragment declares', () => {
        expect(() => {
            requireDeclared(['A'], { A: {} }, 'frag');
        }).not.toThrow();
    });

    it('refuses the first name it does not', () => {
        expect(() => {
            requireDeclared(['A', 'B'], { A: {} }, 'frag');
        }).toThrow(/frag: variant B is not declared/);
    });
});
