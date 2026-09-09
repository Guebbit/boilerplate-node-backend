/**
 * @module
 * Secret-ring encryption at rest, and the ring operations built on it — mint, rotate, drop. Same
 * shape as `account/two-factor/totp.ts`'s TOTP secret encryption: AES-256-GCM, a versioned key
 * from `getWebhookEncryptionKey` (`./config`, backed by `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`,
 * `requiredConfig` — see `./module`) — so a future key rotation can decrypt an old row against its
 * own key while signing new ones with the new one.
 *
 * A plaintext secret exists here only for the seconds it takes to mint it and hand it back in an
 * HTTP response (see `openapi.yaml`'s `secret`/`newSecret`), and again in memory for as long as one
 * delivery attempt needs it to sign — `./model`'s `WebhookSubscriptionDocument.secrets` never
 * carries it.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { getWebhookEncryptionKey } from './config';
import type { WebhookSecretRingEntry } from './model';

/**
 * A freshly minted plaintext secret, Standard-Webhooks-shaped: `whsec_` over 32 random bytes,
 * base64 — the same encoding `webhook-signing.ts`'s `decodeSecret` strips and decodes, so a
 * secret minted here verifies against any Standard Webhooks-compatible consumer library.
 */
const generatePlaintextSecret = (): string => `whsec_${randomBytes(32).toString('base64')}`;

/** AES-256-GCM needs a 32-byte key; the configured value is an operator-chosen string of any length. */
const deriveKey = (secret: string): Buffer => createHash('sha256').update(secret).digest();

/**
 * Encrypt a ring secret for storage.
 *
 * Format: `<key-version>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>` — same versioned shape as
 * `encryptTotpSecret`, for the same reason: a future key rotation needs to tell which key an
 * already-stored row was encrypted under.
 */
export const encryptRingSecret = (plaintext: string): string => {
    const { version, key } = getWebhookEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${version}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
};

/**
 * Decrypt a stored ring secret.
 *
 * @throws when the format is malformed, the key is wrong, or the auth tag does not match
 *   (tampering, or a key version this deployment no longer holds)
 */
export const decryptRingSecret = (stored: string): string => {
    const [version, ivHex, tagHex, ciphertextHex] = stored.split(':');
    const configured = getWebhookEncryptionKey();
    if (version !== configured.version)
        throw new Error(`Unknown webhook secret key version: ${version}`);

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

/** A new ring entry, and the plaintext it was minted with — the caller hands the plaintext back exactly once. */
export const mintRingSecret = (): { entry: WebhookSecretRingEntry; plaintext: string } => {
    const plaintext = generatePlaintextSecret();
    return {
        entry: {
            id: randomUUID(),
            ciphertext: encryptRingSecret(plaintext),
            createdAt: new Date()
        },
        plaintext
    };
};

/**
 * Every active secret in a ring, decrypted — what a delivery attempt signs with. Ring order is
 * preserved (oldest first), which is also the header's own order: `webhook-signature` lists the
 * newest-minted signature last, so a consumer reading left-to-right sees the secret it is about
 * to retire first and the one it should switch to last.
 */
export const activeRingSecrets = (ring: readonly WebhookSecretRingEntry[]): string[] =>
    ring.map((entry) => decryptRingSecret(entry.ciphertext));

/** Drop one entry from a ring by its id — the second half of a rotation, once every consumer has switched. */
export const removeRingSecret = (
    ring: readonly WebhookSecretRingEntry[],
    id: string
): WebhookSecretRingEntry[] => ring.filter((entry) => entry.id !== id);
