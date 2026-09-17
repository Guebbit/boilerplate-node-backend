/**
 * @module
 * `account/session/key-ring.ts` — the pure `kid` math `jwt.ts` verifies against. No signing here;
 * that's `session-jwt.test.ts`'s job against the real library.
 */

import { keyId, keyForId } from '@modules/account/session/key-ring';

describe('keyId', () => {
    it('is stable for the same secret', () => {
        expect(keyId('a-secret')).toBe(keyId('a-secret'));
    });

    it('differs between distinct secrets', () => {
        // The property a ring depends on: two members must not collide, or a token signed with
        // one could verify against the other.
        expect(keyId('a-secret')).not.toBe(keyId('another-secret'));
    });

    it('is derived from the secret, not a position — reordering must not change it', () => {
        // The doc's own requirement: dropping the oldest ring entry must not silently repoint an
        // existing token's `kid` at a different key, which a positional scheme would do.
        const ring = ['first-secret', 'second-secret'];
        const idBefore = keyId(ring[1]);
        const rotated = [ring[1]];

        expect(keyId(rotated[0])).toBe(idBefore);
    });
});

describe('keyForId', () => {
    const ring = ['newest-secret', 'oldest-secret'];

    it('finds the ring member a kid names', () => {
        expect(keyForId(ring, keyId('oldest-secret'))).toBe('oldest-secret');
    });

    it('returns undefined for a kid naming no current member', () => {
        // A key this deployment has already retired — the caller turns this into a rejection,
        // never a crash.
        expect(keyForId(ring, keyId('retired-secret'))).toBeUndefined();
    });

    it('returns undefined for an absent kid, rather than defaulting to ring[0]', () => {
        // A token minted with no `kid` at all must not be treated as signed by the current key —
        // that would let an unkeyed forgery pass as though it named the newest secret.
        expect(keyForId(ring, undefined)).toBeUndefined();
    });
});
