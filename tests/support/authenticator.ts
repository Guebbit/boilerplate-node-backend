/**
 * @module
 * The authenticator app a staff test account carries. A staff role grants nothing until one is
 * armed (`callerInScope`), so every account a suite signs in with a role needs one: it is armed
 * straight onto the document, with a fixed secret, and the login's second step is answered with
 * a code computed from that secret.
 */

import { Types } from 'mongoose';
import { userService } from '@modules/users';
import { userRepository } from '@modules/users/tests/factories';
import { accessService } from '@modules/access';
import { encryptTotpSecret } from '@modules/account/two-factor/totp';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { codeFor } from './totp';

/** The base32 secret every test authenticator is armed with — 160 bits, the RFC 4226 size. */
export const TEST_AUTHENTICATOR_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/**
 * Arms an authenticator app on an existing account, written the way the enrolment would have: one
 * enrolled `totp` entry whose secret is encrypted under its own id, and the derived flags with it.
 *
 * @param userId - the account to arm
 * @param secret - the base32 secret the entry holds
 * @throws {Error} when the account does not exist
 */
export const armAuthenticator = (
    userId: string,
    secret: string = TEST_AUTHENTICATOR_SECRET
): Promise<void> =>
    userService.findByIdWithCredentials(userId).then((user) => {
        if (!user) throw new Error(`armAuthenticator: no account ${userId}`);

        const entryId = new Types.ObjectId();
        user.twoFactorMethods.push({
            _id: entryId,
            method: 'totp',
            enrolledAt: new Date(),
            secret: encryptTotpSecret(secret, String(entryId))
        });
        return userService.persistTwoFactorWrite(user).then(() => undefined);
    });

/**
 * Arms the account behind `email` when it holds a staff role and has no authenticator yet — what
 * a suite that created the account with `createUser(…, 'manager')` expects to already be true.
 *
 * @param email - the account's address
 * @returns whether the account is armed afterwards (always `false` for a non-staff account)
 */
export const armStaffAuthenticator = (email: string): Promise<boolean> =>
    userRepository.findOne({ email }).then((user) => {
        if (!user) return false;
        if (user.authenticatorEnabledAt) return true;

        return accessService.rolesOf(user.id, DEPLOYMENT_TENANT_ID).then(({ tenant, platform }) => {
            if (tenant === null && platform === null) return false;
            return armAuthenticator(user.id).then(() => true);
        });
    });

/**
 * The code that answers a login challenge for a test authenticator, then forgets that the code
 * was spent: replay protection refuses a repeated time step, and a suite signs the same account in
 * many times inside one 30-second step.
 *
 * @param email - the account being signed in
 * @param spend - runs the second step with the code and resolves once it has landed
 */
export const withLoginCode = <T>(email: string, spend: (code: string) => Promise<T>): Promise<T> =>
    codeFor(TEST_AUTHENTICATOR_SECRET, 0)
        .then(spend)
        .then((result) =>
            userRepository
                .updateMany({ email }, { $unset: { 'twoFactorMethods.$[].lastUsedStep': '' } })
                .then(() => result)
        );
