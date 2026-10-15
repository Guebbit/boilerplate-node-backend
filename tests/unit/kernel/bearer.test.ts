/**
 * `bearerOf` — the one `Authorization: Bearer` parser the guard and the logout both read with.
 */
import { bearerOf } from '@kernel/cookies';

describe('bearerOf', () => {
    it.each([
        ['Bearer abc.def', 'abc.def'],
        ['bearer abc', 'abc'],
        ['BEARER   abc', 'abc']
    ])('reads the token out of %j', (header, token) => {
        expect(bearerOf(header)).toBe(token);
    });

    it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b', 'Bearerabc'])(
        'answers nothing for %j',
        (header) => {
            expect(bearerOf(header)).toBeUndefined();
        }
    );
});
