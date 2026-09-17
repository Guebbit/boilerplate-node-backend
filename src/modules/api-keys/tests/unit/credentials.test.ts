/**
 * Mint, parse and verify — the one-way hashing half of a credential's lifecycle. See `../../credentials.ts`.
 */

import {
    mintApiKey,
    parseApiKeyToken,
    verifyApiKey,
    displayIdOf
} from '@modules/api-keys/credentials';

describe('mintApiKey', () => {
    it('mints an sk_-prefixed plaintext with an 8-character public prefix', () => {
        const { plaintext, publicPrefix, hash } = mintApiKey();

        expect(plaintext.startsWith('sk_')).toBe(true);
        expect(publicPrefix).toHaveLength(8);
        expect(plaintext.startsWith(`sk_${publicPrefix}_`)).toBe(true);
        expect(hash).not.toBe(plaintext);
    });

    it('mints a different secret and prefix every time', () => {
        const first = mintApiKey();
        const second = mintApiKey();

        expect(first.plaintext).not.toBe(second.plaintext);
        expect(first.publicPrefix).not.toBe(second.publicPrefix);
    });

    it('hashes to something verifyApiKey accepts', () => {
        const { plaintext, hash } = mintApiKey();
        expect(verifyApiKey(plaintext, hash)).toBe(true);
    });
});

describe('parseApiKeyToken', () => {
    it('recovers the public prefix from a real minted token', () => {
        const { plaintext, publicPrefix } = mintApiKey();
        expect(parseApiKeyToken(plaintext)).toEqual({ publicPrefix });
    });

    it('is undefined for a token too short to carry a prefix and separator', () => {
        expect(parseApiKeyToken('sk_tooshort')).toBeUndefined();
    });

    it('is undefined when the byte after the prefix is not the separator', () => {
        // 8 characters after `sk_`, but the next byte is not `_` — a corrupted or foreign token,
        // not one of ours.
        expect(parseApiKeyToken('sk_abcdefghXsecret')).toBeUndefined();
    });

    it('is undefined for an unrelated bearer token', () => {
        expect(parseApiKeyToken('eyJhbGciOiJIUzI1NiJ9.not-a-real-jwt')).toBeUndefined();
    });

    it('does not misparse a prefix or secret that legitimately contains an underscore', () => {
        // base64url's own alphabet includes `_` — position-based slicing (not `split('_')`) is
        // what keeps this correct regardless of where one lands.
        const token = 'sk_ab_cdefg_z9-_-secret-with-underscores_and-dashes';
        expect(parseApiKeyToken(token)).toEqual({ publicPrefix: 'ab_cdefg' });
    });
});

describe('verifyApiKey', () => {
    it('rejects a tampered plaintext against the original hash', () => {
        const { plaintext, hash } = mintApiKey();
        expect(verifyApiKey(`${plaintext}x`, hash)).toBe(false);
    });

    it('rejects the right plaintext against an unrelated hash', () => {
        const { plaintext } = mintApiKey();
        const { hash: unrelatedHash } = mintApiKey();
        expect(verifyApiKey(plaintext, unrelatedHash)).toBe(false);
    });
});

describe('displayIdOf', () => {
    it('reattaches the sk_ prefix for display, without the secret', () => {
        expect(displayIdOf('a1b2c3d4')).toBe('sk_a1b2c3d4');
    });
});
