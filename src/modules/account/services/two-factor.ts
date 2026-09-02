/**
 * @module
 * Two-factor authentication — enrollment, disabling, and verifying a code against a
 * live account. The login-time challenge (`verifyLoginChallenge`) stops short of minting a
 * session: same reasoning `login()` follows in `./authentication` — a service that also handed
 * back cookies would be two responsibilities wearing one name. `../controllers/post-login-2fa.ts`
 * is the one caller that mints the session, via `issueSession`.
 */

import { t } from '@infrastructure/i18n';
import type { CastError } from 'mongoose';
import { userRepository, type UserDocument } from '@modules/users';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { verifyMfaChallenge } from '../session/jwt';
import {
    generateTotpSecret,
    buildOtpauthUri,
    encryptTotpSecret,
    decryptTotpSecret,
    verifyTotpCode,
    generateBackupCodes,
    hashBackupCode
} from '../two-factor';

/**
 * Verify a caller-supplied code against a user's live secret — a TOTP code first, a backup code
 * second. On a TOTP match, advances `twoFactorLastUsedStep` (replay protection). On a
 * backup-code match, REMOVES that code from the list — a backup code works once.
 * Mutates `user` in place; the caller still has to `userRepository.save` it.
 */
const verifyCodeOrBackup = (user: UserDocument, code: string): Promise<boolean> => {
    const secret = decryptTotpSecret(user.twoFactorSecret!);
    return verifyTotpCode(secret, code, user.twoFactorLastUsedStep).then((totp) => {
        if (totp.valid) {
            user.twoFactorLastUsedStep = totp.timeStep;
            return true;
        }

        const hashed = hashBackupCode(code);
        const index = user.twoFactorBackupCodes.indexOf(hashed);
        if (index === -1) return false;

        user.twoFactorBackupCodes.splice(index, 1);
        return true;
    });
};

/**
 * `POST /account/2fa/setup` — starts (or restarts) enrollment. Generates a fresh secret, stores
 * it ENCRYPTED with no `twoFactorEnabledAt`, and hands back the plaintext secret and its
 * `otpauth://` URI. Calling this again before confirming overwrites the pending secret, and — by
 * design — also clears any secret already CONFIRMED: this is the re-enrollment path for "I lost
 * my phone but still have my session", gated behind fresh critical auth same as disabling.
 *
 * @param userId - the caller, already fresh-auth'd by the route guard
 */
export const setupTwoFactor = (
    userId: string
): Promise<ResponseSuccess<{ secret: string; otpauthUri: string }> | ResponseReject> =>
    userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<{ secret: string; otpauthUri: string }> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);

            const secret = generateTotpSecret();
            user.twoFactorSecret = encryptTotpSecret(secret);
            user.twoFactorEnabledAt = undefined;
            user.twoFactorLastUsedStep = undefined;
            user.twoFactorBackupCodes = [];

            return userRepository
                .save(user)
                .then(() =>
                    generateSuccess({ secret, otpauthUri: buildOtpauthUri(secret, user.email) })
                );
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

/**
 * `POST /account/2fa/confirm` — arms the pending secret from `setupTwoFactor` against a code the
 * caller has demonstrably read off their own device. Mints and stores
 * `BACKUP_CODE_COUNT` backup codes, returned in the clear exactly once.
 *
 * @param userId - the caller
 * @param code - the 6-digit code from their authenticator app
 */
export const confirmTwoFactor = (
    userId: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<{ backupCodes: string[] }> | ResponseReject> => {
    const outcome = userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<{ backupCodes: string[] }> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);
            if (!user.twoFactorSecret)
                return generateReject(422, [t('account.two-factor.setup-not-started')]);

            const secret = decryptTotpSecret(user.twoFactorSecret);
            return verifyTotpCode(secret, code).then((result) => {
                if (!result.valid) return generateReject(422, [t('account.two-factor.wrong-code')]);

                const backupCodes = generateBackupCodes();
                user.twoFactorEnabledAt = new Date();
                user.twoFactorLastUsedStep = result.timeStep;
                user.twoFactorBackupCodes = backupCodes.map((code) => hashBackupCode(code));

                return userRepository.save(user).then(() => generateSuccess({ backupCodes }));
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

    return outcome.then((result) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_2FA_ENROLLED,
                outcome: result.success ? 'success' : 'failure'
            })
        );
        return result;
    });
};

/**
 * `DELETE /account/2fa` — disables 2FA. Requires fresh critical auth (the route guard) AND a
 * valid code or backup code: disabling from a stolen-but-fresh session is otherwise the
 * cheapest way around the whole feature.
 *
 * @param userId - the caller
 * @param code - a TOTP code or an unused backup code
 */
export const disableTwoFactor = (
    userId: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> => {
    const outcome = userRepository
        .findByIdWithCredentials(userId)
        .then<ResponseSuccess<undefined> | ResponseReject>((user) => {
            if (!user) return generateReject(401, []);
            if (!user.twoFactorEnabledAt)
                return generateReject(422, [t('account.two-factor.not-enabled')]);

            return verifyCodeOrBackup(user, code).then((matched) => {
                if (!matched) return generateReject(422, [t('account.two-factor.wrong-code')]);

                user.twoFactorSecret = undefined;
                user.twoFactorEnabledAt = undefined;
                user.twoFactorLastUsedStep = undefined;
                user.twoFactorBackupCodes = [];

                return userRepository.save(user).then(() => generateSuccess(undefined));
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error));

    return outcome.then((result) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_2FA_DISABLED,
                outcome: result.success ? 'success' : 'failure'
            })
        );
        return result;
    });
};

/**
 * `POST /account/login/2fa` — the second step of a 2FA login. Verifies the challenge token from
 * `POST /account/login` and the code against the account it names, but does NOT mint a session —
 * see the module doc. A challenge that fails to verify (expired, wrong signature, wrong
 * `purpose`) and an account with no 2FA enabled both answer 401: neither should tell a caller
 * which one they hit.
 *
 * @param challenge - the challenge token from the first login step
 * @param code - a TOTP code or an unused backup code
 */
export const verifyLoginChallenge = (
    challenge: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // Two-argument `.then`, not a trailing `.catch`: a rejected challenge (expired, wrong
    // signature, wrong `purpose`) and a database error further down are different failures and
    // must not share one handler — a `.catch` here would report a save failure as an invalid
    // challenge.
    const outcome = verifyMfaChallenge(challenge).then(
        (claims) =>
            userRepository
                .findByIdWithCredentials(claims.id)
                .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
                    if (!user?.twoFactorEnabledAt) return generateReject(401, []);

                    return verifyCodeOrBackup(user, code).then((matched) => {
                        if (!matched)
                            return generateReject(422, [t('account.two-factor.wrong-code')]);
                        return userRepository.save(user).then((saved) => generateSuccess(saved));
                    });
                })
                .catch((error: CastError | Error) => rejectDatabaseEnvelope('auth', error)),
        () => generateReject(401, [t('account.two-factor.challenge-invalid')])
    );

    // Failure only: a successful challenge is not itself a completed login — `postLoginTwoFactor`
    // fires `AUTH_LOGIN` once a session actually exists. Auditing success here too would claim a
    // login happened before it has.
    return outcome.then((result) => {
        if (!result.success)
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_2FA_CHALLENGE_FAILED,
                    outcome: 'failure'
                })
            );
        return result;
    });
};
