/**
 * @module
 * AES-256-GCM at rest, versioned so a key rotation can decrypt an old row against the key it was
 * written under while signing new ones with the new key. Shared by `account/two-factor/totp.ts`
 * (`NODE_TOTP_ENCRYPTION_KEY`) and `webhooks/secrets.ts` (`NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`) —
 * same format, different keys, so the crypto is written once.
 *
 * Rotation is a RING, the same shape `account/session/config.ts`'s `parseKeyRing` gives the JWT
 * secrets: newest first, encrypt always with `ring[0]`, decrypt by looking up the ciphertext's own
 * stamped version among every entry the ring carries. `docs/tools/security.md`'s "Database
 * credential and key rotation" is the operator-facing runbook this exists for.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** An operator-configured encryption key, tagged with the version stamped on ciphertext it produces. */
export interface VersionedKey {
    version: string;
    key: string;
}

/**
 * `NODE_TOTP_ENCRYPTION_KEY`/`NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`'s wire format: `version:key`
 * entries, comma-separated, newest first — `v2:<new-secret>,v1:<old-secret>` while a rotation is
 * in flight, one entry once it's done. A bare value with no `:` defaults to `v1`, so an existing
 * single-key deployment needs no env change to pick this up.
 *
 * `:` is safe as the version/key delimiter: `randomBytes(...).toString('base64'|'hex')`, the two
 * shapes an operator is expected to generate this with, contain neither `:` nor `,`.
 */
export const parseVersionedKeyRing = (raw: string | undefined): VersionedKey[] =>
    (raw ?? '')
        .split(',')
        .filter((entry) => entry.length > 0)
        .map((entry) => {
            const colon = entry.indexOf(':');
            return colon === -1
                ? { version: 'v1', key: entry }
                : { version: entry.slice(0, colon), key: entry.slice(colon + 1) };
        });

/**
 * Which ring a ciphertext belongs to. It is the HKDF `info` label, so the three rings derive
 * unrelated keys even if an operator reuses one secret for two of them.
 */
export type SecretPurpose = 'pii' | 'totp' | 'webhook-secret';

/**
 * What binds a ciphertext to its place.
 *
 * Fields:
 *   purpose - the ring (HKDF label).
 *   aad     - GCM associated data, e.g. `users:phone:<user _id>`. A ciphertext copied to another row
 *             or field fails its auth tag instead of decrypting.
 */
export interface SecretBinding {
    purpose: SecretPurpose;
    aad: string;
}

/**
 * AES-256-GCM needs a 32-byte key; the configured value is an operator-chosen string of any
 * length, so it is stretched with HKDF-SHA256 (`node:crypto`, no new dependency) rather than a
 * single hash pass. HKDF does not add work against a weak secret (RFC 5869); the boot check
 * demands key-sized entropy for that.
 * `purpose` is the HKDF `info`: domain separation between rings.
 * https://nodejs.org/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen
 */
const deriveKey = (secret: string, purpose: SecretPurpose): Buffer =>
    Buffer.from(hkdfSync('sha256', secret, '', purpose, 32));

/** GCM authentication tag length, in bytes — the full 128 bits, and the only length accepted back. */
const AUTH_TAG_BYTES = 16;

/**
 * Encrypt a secret for storage, always under the ring's newest (first) key.
 *
 * Format: `<key-version>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>` — versioned so a future key
 * rotation can decrypt old rows against their own key while signing new ones with the new key,
 * rather than a migration that cannot tell which key a row used.
 *
 * @param ring - newest key first; see {@link parseVersionedKeyRing}
 * @param binding - the ring's HKDF label and the row/field this value is bound to
 */
export const encryptVersionedSecret = (
    plaintext: string,
    ring: readonly VersionedKey[],
    binding: SecretBinding
): string => {
    const { version, key } = ring[0];
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(key, binding.purpose), iv);
    // Associated data: authenticated but not stored, so it must be re-supplied to decrypt.
    cipher.setAAD(Buffer.from(binding.aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${version}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
};

/**
 * Decrypt a stored secret, against whichever ring entry wrote it.
 *
 * @param ring - every key this deployment still holds, in any order — lookup is by the
 *   ciphertext's own stamped version, not by position
 * @param binding - must equal the one it was encrypted under, or the auth tag fails
 * @param label - what to name the secret in the version-mismatch error, e.g. `'TOTP'` or
 *   `'webhook secret'`
 * @throws when the format is malformed, the stamped version names no key in the ring, or the auth
 *   tag does not match (tampering, or a key version this deployment has since dropped)
 */
export const decryptVersionedSecret = (
    stored: string,
    ring: readonly VersionedKey[],
    binding: SecretBinding,
    label: string
): string => {
    const [version, ivHex, tagHex, ciphertextHex] = stored.split(':', 4);
    const configured = ring.find((entry) => entry.version === version);
    if (!configured) throw new Error(`Unknown ${label} key version: ${version}`);

    const decipher = createDecipheriv(
        'aes-256-gcm',
        deriveKey(configured.key, binding.purpose),
        Buffer.from(ivHex, 'hex'),
        // The full 16-byte tag `encryptVersionedSecret` writes. Unset, Node also accepts a tag
        // truncated to as little as 4 bytes, which is far easier to forge.
        // https://nodejs.org/api/crypto.html#cryptocreatedecipherivalgorithm-key-iv-options
        { authTagLength: AUTH_TAG_BYTES }
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    decipher.setAAD(Buffer.from(binding.aad, 'utf8'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, 'hex')),
        decipher.final()
    ]).toString('utf8');
};
