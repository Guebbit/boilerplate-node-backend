/**
 * @module
 * Moves every enrolled TOTP secret onto the newest `NODE_TOTP_ENCRYPTION_KEY`. The secrets sit on
 * the `users` document, so the walk is `users`'; this module owns the ring and the binding rule.
 * Run by the ops script `reencrypt`; see `@infrastructure/security/reencrypt`.
 */

import { reencryptTwoFactorSecrets } from '@modules/users';
import { getTotpEncryptionKeyRing } from '../session/config';
import { totpBinding } from '../two-factor/totp';

/**
 * Re-encrypts every TOTP device secret onto the newest TOTP key.
 *
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptTotpSecrets = (dryRun = false) =>
    reencryptTwoFactorSecrets({ ring: getTotpEncryptionKeyRing(), bindingOf: totpBinding }, dryRun);
