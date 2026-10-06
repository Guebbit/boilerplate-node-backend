/**
 * AES-256-GCM at rest, versioned — see `src/infrastructure/security/versioned-secret.ts`.
 * `account/two-factor/totp.ts` and `webhooks/secrets.ts` each test their own thin wrapper for a
 * round trip; the crypto, the ring lookup and the version-mismatch behaviour underneath are
 * tested once, here.
 */

import {
    encryptVersionedSecret,
    decryptVersionedSecret,
    parseVersionedKeyRing,
    type SecretBinding,
    type VersionedKey
} from '@infrastructure/security/versioned-secret';

const KEY: VersionedKey = { version: 'v1', key: 'test-key-material' };
const RING: VersionedKey[] = [KEY];
const BIND: SecretBinding = { purpose: 'pii', aad: 'tests:field:1' };

describe('encryptVersionedSecret / decryptVersionedSecret', () => {
    it('round-trips a plaintext secret', () => {
        const ciphertext = encryptVersionedSecret('hello-world', RING, BIND);
        expect(decryptVersionedSecret(ciphertext, RING, BIND, 'test')).toBe('hello-world');
    });

    it('never stores the plaintext inside the ciphertext', () => {
        const ciphertext = encryptVersionedSecret('a-very-guessable-secret', RING, BIND);
        expect(ciphertext).not.toContain('a-very-guessable-secret');
    });

    it('stamps the ciphertext with the key version, colon-delimited from iv/tag/data', () => {
        const ciphertext = encryptVersionedSecret('x', RING, BIND);
        expect(ciphertext.split(':')).toHaveLength(4);
        expect(ciphertext.startsWith('v1:')).toBe(true);
    });

    it('produces a different ciphertext each time (a fresh IV), same plaintext', () => {
        const a = encryptVersionedSecret('same-plaintext', RING, BIND);
        const b = encryptVersionedSecret('same-plaintext', RING, BIND);
        expect(a).not.toBe(b);
        expect(decryptVersionedSecret(a, RING, BIND, 'test')).toBe(
            decryptVersionedSecret(b, RING, BIND, 'test')
        );
    });

    it('throws on an unknown key version rather than silently misreading the row', () => {
        const ciphertext = encryptVersionedSecret('x', RING, BIND).replace(/^v1:/, 'v99:');
        expect(() => decryptVersionedSecret(ciphertext, RING, BIND, 'widget')).toThrow(
            /Unknown widget key version: v99/
        );
    });

    it('throws when the ciphertext or auth tag has been tampered with', () => {
        const ciphertext = encryptVersionedSecret('tamper-me', RING, BIND);
        const [version, iv, tag, data] = ciphertext.split(':', 4);
        const flippedData = data.slice(0, -2) + (data.at(-2) === '0' ? '1' : '0') + data.at(-1);
        expect(() =>
            decryptVersionedSecret(`${version}:${iv}:${tag}:${flippedData}`, RING, BIND, 'test')
        ).toThrow();
    });

    it('refuses a truncated auth tag, which would be far easier to forge', () => {
        const ciphertext = encryptVersionedSecret('JBSWY3DPEHPK3PXP', RING, BIND);
        const [version, iv, tag, data] = ciphertext.split(':', 4);

        expect(() =>
            decryptVersionedSecret(
                `${version}:${iv}:${tag.slice(0, 8)}:${data}`,
                RING,
                BIND,
                'TOTP'
            )
        ).toThrow();
    });

    it('rotation: encrypts under the newest (first) ring entry, decrypts old rows against the entry they were written under', () => {
        const oldRing = [KEY];
        const oldCiphertext = encryptVersionedSecret('written-before-rotation', oldRing, BIND);

        // Rotate: prepend the new key, keep the old one so its ciphertexts still decrypt.
        const rotatedRing = [{ version: 'v2', key: 'rotated-key-material' }, KEY];
        const newCiphertext = encryptVersionedSecret('written-after-rotation', rotatedRing, BIND);

        expect(newCiphertext.startsWith('v2:')).toBe(true);
        expect(decryptVersionedSecret(oldCiphertext, rotatedRing, BIND, 'test')).toBe(
            'written-before-rotation'
        );
        expect(decryptVersionedSecret(newCiphertext, rotatedRing, BIND, 'test')).toBe(
            'written-after-rotation'
        );
    });

    it('rotation: a row under a key dropped from the ring fails loudly instead of misreading', () => {
        const ciphertext = encryptVersionedSecret('x', [KEY], BIND);
        const droppedRing = [{ version: 'v2', key: 'rotated-key-material' }];
        expect(() => decryptVersionedSecret(ciphertext, droppedRing, BIND, 'widget')).toThrow(
            /Unknown widget key version: v1/
        );
    });
});

describe('parseVersionedKeyRing', () => {
    it('treats an unset env var as an empty ring', () => {
        expect(parseVersionedKeyRing(undefined)).toEqual([]);
    });

    it('defaults a bare, unversioned value to v1 — an existing single-key deployment needs no env change', () => {
        expect(parseVersionedKeyRing('plain-secret')).toEqual([
            { version: 'v1', key: 'plain-secret' }
        ]);
    });

    it('parses an explicit ring, newest first', () => {
        expect(parseVersionedKeyRing('v2:new-secret,v1:old-secret')).toEqual([
            { version: 'v2', key: 'new-secret' },
            { version: 'v1', key: 'old-secret' }
        ]);
    });

    it('refuses a ciphertext moved to another row or field (different AAD)', () => {
        const ciphertext = encryptVersionedSecret('bound', RING, BIND);
        const elsewhere: SecretBinding = { purpose: 'pii', aad: 'tests:field:2' };

        expect(() => decryptVersionedSecret(ciphertext, RING, elsewhere, 'test')).toThrow();
    });

    it('refuses a ciphertext read under another ring purpose (different HKDF label)', () => {
        const ciphertext = encryptVersionedSecret('bound', RING, BIND);
        const otherRing: SecretBinding = { purpose: 'totp', aad: BIND.aad };

        expect(() => decryptVersionedSecret(ciphertext, RING, otherRing, 'test')).toThrow();
    });
});
