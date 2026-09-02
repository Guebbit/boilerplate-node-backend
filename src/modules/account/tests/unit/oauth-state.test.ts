/**
 * @module
 * The OAuth CSRF handshake — `oauth/state.ts`. Pure functions only: cookie plumbing is exercised
 * end to end by the integration/contract suites, this covers the comparison and the token shape.
 */

import { generateOAuthState, stateMatches } from '../../oauth/state';

describe('generateOAuthState', () => {
    it('mints a hex string with 128 bits of entropy', () => {
        const state = generateOAuthState();

        expect(state).toMatch(/^[\da-f]{32}$/);
    });

    it('never repeats across calls', () => {
        expect(generateOAuthState()).not.toBe(generateOAuthState());
    });
});

describe('stateMatches', () => {
    it('matches an identical, non-empty pair', () => {
        expect(stateMatches('abc123', 'abc123')).toBe(true);
    });

    it('rejects a mismatch', () => {
        expect(stateMatches('abc123', 'different')).toBe(false);
    });

    it('rejects when either side is missing', () => {
        expect(stateMatches(undefined, 'abc123')).toBe(false);
        expect(stateMatches('abc123', undefined)).toBe(false);
        expect(stateMatches(undefined, undefined)).toBe(false);
    });

    it('rejects a repeated query param — express hands that back as an array', () => {
        expect(stateMatches('abc123', ['abc123'])).toBe(false);
    });

    it('rejects two empty cookies rather than treating them as matching', () => {
        expect(stateMatches('', '')).toBe(false);
    });
});
