/**
 * @module
 * Re-encryption of what the `users` collection stores encrypted: the phone (PII ring) and the
 * 2FA secrets (the ring `account` owns, passed in — this module never imports `account`).
 * Run by the ops script `reencrypt`; see `@infrastructure/security/reencrypt`.
 */

import type { EncryptedField } from '@infrastructure/security/reencrypt';
import { getPiiEncryptionKeyRing, piiBinding } from '@infrastructure/security/pii-encryption';
import type { SecretBinding, VersionedKey } from '@infrastructure/security/versioned-secret';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';

/**
 * Re-encrypts every user's phone onto the newest PII key.
 *
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptUserPhones = (dryRun = false) =>
    userRepository.reencrypt(
        {
            filter: { phone: { $exists: true } },
            ring: getPiiEncryptionKeyRing(),
            fieldsOf: (user: UserDocument): EncryptedField[] =>
                user.phone === undefined
                    ? []
                    : [
                          {
                              path: 'phone',
                              stored: user.phone,
                              binding: piiBinding(`users:phone:${String(user._id)}`),
                              label: 'users.phone'
                          }
                      ]
        },
        dryRun
    );

/**
 * What a caller that owns a 2FA secret ring tells this module so it can walk the secrets.
 *
 * Fields:
 *   ring      - the ring the secrets are written under.
 *   bindingOf - the binding of the secret on one method entry, from its `_id`.
 */
export interface TwoFactorSecretRing {
    ring: readonly VersionedKey[];
    bindingOf: (methodId: string) => SecretBinding;
}

/**
 * Re-encrypts every enrolled device secret (`twoFactorMethods.secret`) onto the newest key of the
 * ring its owner passes.
 *
 * @param secrets - the ring and binding rule of the secret's owner (`account`)
 * @param dryRun - count what a real run would move and write nothing
 */
export const reencryptTwoFactorSecrets = (secrets: TwoFactorSecretRing, dryRun = false) =>
    userRepository.reencrypt(
        {
            filter: { 'twoFactorMethods.secret': { $exists: true } },
            // Hidden by default (`select: false`), like every credential on the document.
            select: '+twoFactorMethods',
            ring: secrets.ring,
            fieldsOf: (user: UserDocument): EncryptedField[] =>
                user.twoFactorMethods.flatMap((method, index) =>
                    method.secret === undefined
                        ? []
                        : [
                              {
                                  path: `twoFactorMethods.${String(index)}.secret`,
                                  stored: method.secret,
                                  binding: secrets.bindingOf(String(method._id)),
                                  label: `users.twoFactorMethods.secret`
                              }
                          ]
                )
        },
        dryRun
    );
