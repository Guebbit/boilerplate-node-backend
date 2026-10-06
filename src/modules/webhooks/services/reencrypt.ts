/**
 * @module
 * Moves every subscription's ring secrets onto the newest `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`.
 * Run by the ops script `reencrypt`; see `@infrastructure/security/reencrypt`.
 */

import type { EncryptedField } from '@infrastructure/security/reencrypt';
import type { WebhookSubscriptionDocument } from '../model';
import { webhookSubscriptionRepository } from '../repository';
import { getWebhookEncryptionKeyRing } from '../config';
import { ringSecretBinding } from '../secrets';

/** Every ring secret one subscription holds, bound to its own entry id. */
const fieldsOf = (subscription: WebhookSubscriptionDocument): EncryptedField[] =>
    subscription.secrets.map((entry, index) => ({
        path: `secrets.${String(index)}.ciphertext`,
        stored: entry.ciphertext,
        binding: ringSecretBinding(entry.id),
        label: 'webhooksubscriptions.secrets.ciphertext'
    }));

/**
 * Re-encrypts every webhook signing secret onto the newest key.
 *
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptWebhookSecrets = (dryRun = false) =>
    webhookSubscriptionRepository.reencrypt(
        { ring: getWebhookEncryptionKeyRing(), fieldsOf },
        dryRun
    );
