/**
 * @module
 * AES-256-GCM at rest, versioned so a key rotation can decrypt an old row against the key it was
 * written under while signing new ones with the new key. Shared by `account/two-factor/totp.ts`
 * (`NODE_TOTP_ENCRYPTION_KEY`) and `webhooks/secrets.ts` (`NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`) —
 * same format, different keys, so the crypto is written once.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** An operator-configured encryption key, tagged with the version stamped on ciphertext it produces. */
export interface VersionedKey {
    version: string;
    key: string;
}

/** AES-256-GCM needs a 32-byte key; the configured value is an operator-chosen string of any length. */
const deriveKey = (secret: string): Buffer => createHash('sha256').update(secret).digest();

/**
 * Encrypt a secret for storage.
 *
 * Format: `<key-version>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>` — versioned so a future key
 * rotation can decrypt old rows against their own key while signing new ones with the new key,
 * rather than a migration that cannot tell which key a row used.
 */
export const encryptVersionedSecret = (
    plaintext: string,
    { version, key }: VersionedKey
): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${version}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
};

/**
 * Decrypt a stored secret.
 *
 * @param label - what to name the secret in the version-mismatch error, e.g. `'TOTP'` or
 *   `'webhook secret'`
 * @throws when the format is malformed, the key is wrong, or the auth tag does not match
 *   (tampering, or a key version this deployment no longer holds)
 */
export const decryptVersionedSecret = (
    stored: string,
    configured: VersionedKey,
    label: string
): string => {
    const [version, ivHex, tagHex, ciphertextHex] = stored.split(':');
    if (version !== configured.version) throw new Error(`Unknown ${label} key version: ${version}`);

    const decipher = createDecipheriv(
        'aes-256-gcm',
        deriveKey(configured.key),
        Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, 'hex')),
        decipher.final()
    ]).toString('utf8');
};
