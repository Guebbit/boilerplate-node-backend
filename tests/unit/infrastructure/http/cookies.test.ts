/**
 * @module
 * `cookieOf` — one named cookie off a request, `undefined` when it was never set.
 */

import { cookieOf } from '@infrastructure/http/cookies';

describe('cookieOf', () => {
    it('returns the named cookie', () => {
        expect(cookieOf({ cookies: { jwt: 'abc', other: 'x' } }, 'jwt')).toBe('abc');
    });

    it('returns undefined for a cookie that was never set', () => {
        expect(cookieOf({ cookies: { other: 'x' } }, 'jwt')).toBeUndefined();
    });
});
