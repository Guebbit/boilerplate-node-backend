/**
 * @module
 * The OAuth CSRF and PKCE handshakes — `oauth/state.ts`. Pure functions only: cookie plumbing is
 * exercised end to end by the integration/contract suites, this covers the comparison and both
 * token shapes.
 */

import {
    generateOAuthState,
    stateMatches,
    generateCodeVerifier,
    codeChallengeOf
} from '../../oauth/state';

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

describe('generateCodeVerifier', () => {
    it('mints a base64url string with 256 bits of entropy', () => {
        const verifier = generateCodeVerifier();

        expect(verifier).toMatch(/^[\w-]{43}$/);
    });

    it('never repeats across calls', () => {
        expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
    });
});

describe('codeChallengeOf', () => {
    it('is deterministic — the same verifier always hashes to the same challenge', () => {
        const verifier = generateCodeVerifier();

        expect(codeChallengeOf(verifier)).toBe(codeChallengeOf(verifier));
        expect(codeChallengeOf(verifier)).toMatch(/^[\w-]{43}$/);
    });

    it('differs for a different verifier', () => {
        expect(codeChallengeOf('verifier-a')).not.toBe(codeChallengeOf('verifier-b'));
    });

    it("matches RFC 7636's own worked example", () => {
        // https://www.rfc-editor.org/rfc/rfc7636#appendix-B
        expect(codeChallengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
            'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
        );
    });
});
