/**
 * @module
 * The `signInMethods` section of the account data export: which ways in an account holds, as
 * facts about the account and never as material that opens it.
 *
 * Why it is its own section: a linked provider identity is an online identifier (GDPR Art. 4(1))
 * and part of what an access request (Art. 15) answers, but it lives on the User document behind
 * `select: false`, so the plain `profile` section does not carry it.
 *
 * Never exported: a second factor's secret, its code in flight or its delivery state, the backup
 * code digests, the password hash.
 */

import type { ExportSignInMethods } from '@types';
import { userRepository } from '../repository';

/**
 * The sign-in methods this account holds.
 *
 * @param userId - the account being exported
 * @returns the linked providers and the armed second factors; `undefined` when the account is gone
 *   (the assembly then omits the section, and the `profile` section answers the 404)
 */
export const exportSignInMethods = (userId: string): Promise<ExportSignInMethods | undefined> =>
    userRepository.findByIdWithCredentials(userId).then((user) =>
        user
            ? {
                  providers: user.oauthAccounts.map(({ provider, providerId, connectedAt }) => ({
                      provider,
                      providerId,
                      connectedAt: connectedAt.toISOString()
                  })),
                  // A factor whose setup was abandoned halfway has no `enrolledAt`: it never
                  // guarded a login, so it is not a way in.
                  twoFactor: user.twoFactorMethods.flatMap(({ method, enrolledAt }) =>
                      enrolledAt ? [{ method, enrolledAt: enrolledAt.toISOString() }] : []
                  )
              }
            : undefined
    );
