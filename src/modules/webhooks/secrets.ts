/**
 * @module
 * Secret-ring encryption at rest, and the ring operations built on it — mint, rotate, drop.
 * Encryption itself is `@infrastructure/security/versioned-secret`'s — AES-256-GCM under a
 * versioned key ring from `getWebhookEncryptionKeyRing` (`./config`, backed by
 * `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`, a required `versionedKeyRing` field) — shared with
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
    decryptVersionedSecret,
    type SecretBinding
} from '@infrastructure/security/versioned-secret';
import { getWebhookEncryptionKeyRing, getWebhookSecretOverlapMs } from './config';
import type { WebhookSecretRingEntry } from './model';

/**
 * A freshly minted plaintext secret, Standard-Webhooks-shaped: `whsec_` over 32 random bytes,
 * base64 — the same encoding `webhook-signing.ts`'s `decodeSecret` strips and decodes, so a
 * secret minted here verifies against any Standard Webhooks-compatible consumer library.
 */
const generatePlaintextSecret = (): string => `whsec_${randomBytes(32).toString('base64')}`;

/**
 * The binding of a ring secret to its entry: the `webhook-secret` HKDF label and the entry's own
 * `id` as associated data. Also what a re-encryption job rewraps under.
 */
export const ringSecretBinding = (entryId: string): SecretBinding => ({
    purpose: 'webhook-secret',
    aad: entryId
});

/**
 * Encrypt a ring secret for storage. See `encryptVersionedSecret` for the wire format.
 *
 * @param entryId - the ring entry's own `id`, the AAD: the parent subscription has no `_id` yet
 *   when its first secret is minted, so the entry id is the only stable binding
 */
export const encryptRingSecret = (plaintext: string, entryId: string): string =>
    encryptVersionedSecret(plaintext, getWebhookEncryptionKeyRing(), ringSecretBinding(entryId));

/**
 * Decrypt a stored ring secret.
 *
 * @param entryId - the ring entry's `id`, as at encryption
 * @throws when the format is malformed, the key is wrong, or the auth tag does not match
 *   (tampering, or a key version this deployment no longer holds)
 */
export const decryptRingSecret = (stored: string, entryId: string): string =>
    decryptVersionedSecret(
        stored,
        getWebhookEncryptionKeyRing(),
        ringSecretBinding(entryId),
        'webhook secret'
    );

/** A new ring entry, and the plaintext it was minted with — the caller hands the plaintext back exactly once. */
export const mintRingSecret = (): { entry: WebhookSecretRingEntry; plaintext: string } => {
    const plaintext = generatePlaintextSecret();
    const id = randomUUID();
    return {
        entry: {
            id,
            ciphertext: encryptRingSecret(plaintext, id),
            createdAt: new Date()
        },
        plaintext
    };
};

/**
 * The ring entries still in force at `now`. The newest never expires; an older one stops counting
 * once its successor has been live for the overlap window (`NODE_WEBHOOK_SECRET_OVERLAP_HOURS`),
 * which is what bounds how long a leaked, superseded secret can sign.
 *
 * @param ring - the stored ring, oldest first
 * @param now - the instant to judge against
 */
export const liveRingEntries = (
    ring: readonly WebhookSecretRingEntry[],
    now: Date = new Date()
): WebhookSecretRingEntry[] => {
    const overlapMs = getWebhookSecretOverlapMs();
    return ring.filter(
        (_entry, index) =>
            index === ring.length - 1 ||
            now.getTime() < ring[index + 1].createdAt.getTime() + overlapMs
    );
};

/**
 * Every live secret in a ring, decrypted — what a delivery attempt signs with. Ring order is
 * preserved (oldest first), which is also the header's own order: `webhook-signature` lists the
 * newest-minted signature last, so a consumer reading left-to-right sees the secret it is about
 * to retire first and the one it should switch to last. An expired entry is not signed with.
 *
 * @param ring - the stored ring, oldest first
 * @param now - the instant to judge expiry against
 */
export const activeRingSecrets = (
    ring: readonly WebhookSecretRingEntry[],
    now: Date = new Date()
): string[] =>
    liveRingEntries(ring, now).map((entry) => decryptRingSecret(entry.ciphertext, entry.id));

/** Drop one entry from a ring by its id — the second half of a rotation, once every consumer has switched. */
export const removeRingSecret = (
    ring: readonly WebhookSecretRingEntry[],
    id: string
): WebhookSecretRingEntry[] => ring.filter((entry) => entry.id !== id);
