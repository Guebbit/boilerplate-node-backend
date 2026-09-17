/**
 * @module
 * Secret-ring encryption at rest, and the ring operations built on it — mint, rotate, drop.
 * Encryption itself is `@infrastructure/security/versioned-secret`'s — AES-256-GCM under a
 * versioned key from `getWebhookEncryptionKey` (`./config`, backed by
 * `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`, `requiredConfig` — see `./module`) — shared with
 * `account/two-factor/totp.ts`'s TOTP secret encryption.
 *
 * A plaintext secret exists here only for the seconds it takes to mint it and hand it back in an
 * HTTP response (see `openapi.yaml`'s `secret`/`newSecret`), and again in memory for as long as one
 * delivery attempt needs it to sign — `./model`'s `WebhookSubscriptionDocument.secrets` never
 * carries it.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import {
    encryptVersionedSecret,
    decryptVersionedSecret
} from '@infrastructure/security/versioned-secret';
import { getWebhookEncryptionKey } from './config';
import type { WebhookSecretRingEntry } from './model';

/**
 * A freshly minted plaintext secret, Standard-Webhooks-shaped: `whsec_` over 32 random bytes,
 * base64 — the same encoding `webhook-signing.ts`'s `decodeSecret` strips and decodes, so a
 * secret minted here verifies against any Standard Webhooks-compatible consumer library.
 */
const generatePlaintextSecret = (): string => `whsec_${randomBytes(32).toString('base64')}`;

/** Encrypt a ring secret for storage. See `encryptVersionedSecret` for the wire format. */
export const encryptRingSecret = (plaintext: string): string =>
    encryptVersionedSecret(plaintext, getWebhookEncryptionKey());

/**
 * Decrypt a stored ring secret.
 *
 * @throws when the format is malformed, the key is wrong, or the auth tag does not match
 *   (tampering, or a key version this deployment no longer holds)
 */
export const decryptRingSecret = (stored: string): string =>
    decryptVersionedSecret(stored, getWebhookEncryptionKey(), 'webhook secret');

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
