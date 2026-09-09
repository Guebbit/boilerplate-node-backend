/**
 * AES-256-GCM at rest, versioned — see `src/infrastructure/security/versioned-secret.ts`.
 * `account/two-factor/totp.ts` and `webhooks/secrets.ts` each test their own thin wrapper for a
 * round trip; the crypto and version-mismatch behaviour underneath is tested once, here.
 */

import {
    encryptVersionedSecret,
    decryptVersionedSecret,
    type VersionedKey
} from '@infrastructure/security/versioned-secret';

const KEY: VersionedKey = { version: 'v1', key: 'test-key-material' };

describe('encryptVersionedSecret / decryptVersionedSecret', () => {
    it('round-trips a plaintext secret', () => {
        const ciphertext = encryptVersionedSecret('hello-world', KEY);
        expect(decryptVersionedSecret(ciphertext, KEY, 'test')).toBe('hello-world');
    });

    it('never stores the plaintext inside the ciphertext', () => {
        const ciphertext = encryptVersionedSecret('a-very-guessable-secret', KEY);
        expect(ciphertext).not.toContain('a-very-guessable-secret');
    });

    it('stamps the ciphertext with the key version, colon-delimited from iv/tag/data', () => {
        const ciphertext = encryptVersionedSecret('x', KEY);
        expect(ciphertext.split(':')).toHaveLength(4);
        expect(ciphertext.startsWith('v1:')).toBe(true);
    });

    it('produces a different ciphertext each time (a fresh IV), same plaintext', () => {
        const a = encryptVersionedSecret('same-plaintext', KEY);
        const b = encryptVersionedSecret('same-plaintext', KEY);
        expect(a).not.toBe(b);
        expect(decryptVersionedSecret(a, KEY, 'test')).toBe(decryptVersionedSecret(b, KEY, 'test'));
    });

    it('throws on an unknown key version rather than silently misreading the row', () => {
        const ciphertext = encryptVersionedSecret('x', KEY).replace(/^v1:/, 'v99:');
        expect(() => decryptVersionedSecret(ciphertext, KEY, 'widget')).toThrow(
            /Unknown widget key version: v99/
        );
    });

    it('throws when the ciphertext or auth tag has been tampered with', () => {
        const ciphertext = encryptVersionedSecret('tamper-me', KEY);
        const [version, iv, tag, data] = ciphertext.split(':');
        const flippedData = data.slice(0, -2) + (data.at(-2) === '0' ? '1' : '0') + data.at(-1);
        expect(() =>
            decryptVersionedSecret(`${version}:${iv}:${tag}:${flippedData}`, KEY, 'test')
        ).toThrow();
    });
});
