/**
 * @module
 * The opaque session id of `cookie` mode (`../../session/session-id.ts`): its shape is what the kernel
 * dispatches on and what 256 bits of entropy stands on, so both are asserted rather than assumed.
 */

import { hashToken } from '@infrastructure/security/hash-token';
import { SESSION_TOKEN_PREFIX } from '@kernel/authentication';
import { looksLikeSessionId, newSessionId } from '@modules/account/session/session-id';

describe('newSessionId', () => {
    it('is the kernel prefix and 32 random bytes, base64url, so nothing needs a signing secret', () => {
        const id = newSessionId();

        expect(id.startsWith(SESSION_TOKEN_PREFIX)).toBe(true);
        expect(id.slice(SESSION_TOKEN_PREFIX.length)).toMatch(/^[\w-]{43}$/);
    });

    it('is never the same twice', () => {
        const ids = new Set(Array.from({ length: 500 }, () => newSessionId()));

        expect(ids.size).toBe(500);
    });

    it('can collide with neither a JWT nor a machine key, which is what lets the guard dispatch on it', () => {
        const id = newSessionId();

        expect(id.startsWith('eyJ')).toBe(false);
        expect(id.startsWith('sk_')).toBe(false);
    });

    it('is stored as its digest, so a database read cannot be presented back', () => {
        const id = newSessionId();

        expect(hashToken(id)).not.toBe(id);
        expect(hashToken(id)).toMatch(/^[\da-f]{64}$/);
    });
});

describe('looksLikeSessionId', () => {
    it.each([
        ['an id', 'ses_abc', true],
        ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.e30.sig', false],
        ['an API key', 'sk_abc12345_secret', false],
        ['nothing', '', false],
        ['the prefix in the wrong place', 'x_ses_abc', false]
    ])('is %s', (_label, value, expected) => {
        expect(looksLikeSessionId(value)).toBe(expected);
    });
});
