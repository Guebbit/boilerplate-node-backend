/**
 * @module
 * Proving the password — `login` for a stranger, `verifyOwnPassword` for a signed-in caller about
 * to do something sensitive. Neither mints a session: that is `../session/session`.
 */

import { t } from '@infrastructure/i18n';
import { hashPasswordSync, verifyPassword } from '@infrastructure/security/password-hash';
import { randomBytes } from 'node:crypto';
import { LoginBody } from '@api/schemas.zod';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject,
    validationErrors
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { userService, type UserDocument } from '@modules/users';
import { withOwnAccount } from './caller';

/**
 * An argon2id hash of no real password, computed once at import time (a one-time boot cost, not a
 * per-request one). `login` compares against this on an unknown email, so "no such account"
 * costs the same as "wrong password" — without it, the hash's own cost is exactly what makes the
 * fast path a timing oracle for enumerating registered addresses.
 */
const DUMMY_PASSWORD_HASH = hashPasswordSync(randomBytes(32).toString('hex'));

/**
 * Login user by email/password.
 */
export const login = (
    email?: string,
    password?: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const parseResult = LoginBody.safeParse({
        email,
        password
    });

    if (!parseResult.success)
        return Promise.resolve(generateReject(422, validationErrors(parseResult.error)));

    return (
        userService
            // `password` is select:false — this is one of the few flows that legitimately needs it.
            // `parseResult.data.email`, not the raw `email` param: the parse above is what proves
            // it's actually a string, which the outer `email?: string` signature can't itself tell TS.
            .findForLogin(parseResult.data.email)
            .then((user) => {
                // Compare against DUMMY_PASSWORD_HASH on a miss, so an
                // unknown email costs the same as a wrong password — an unconditional `return`
                // here would answer 401 before the hash's own cost, the timing gap that lets an
                // attacker tell "no such account" from "wrong password" by response time alone.
                return verifyPassword(password ?? '', user?.password ?? DUMMY_PASSWORD_HASH).then(
                    (doMatch) => {
                        if (!user || !doMatch)
                            return generateReject(401, [t('account.login.wrong-data')]);
                        return generateSuccess<UserDocument>(user);
                    }
                );
            })
            .catch((error: unknown) => rejectDatabaseEnvelope('auth', error))
    );
};

/**
 * Verify the caller's OWN current password against their stored hash. 422 on a miss, never 401 —
 * a 401 here reads as "session expired" to a client interceptor and would log out a session that
 * is, in fact, still perfectly valid, in every flow that calls this. An OAuth-only account holds
 * no password to compare against — same 422 as a wrong one, since there is equally nothing this
 * step can do.
 *
 * @param userId - the caller's own id
 * @param password - the password to confirm against the stored hash
 * @param wrongKey - the i18n key each caller's own contract commits to for this rejection
 * @returns the verified user on a match, or the 401/422 rejection
 */
export const verifyOwnPassword = (
    userId: string,
    password: string,
    wrongKey: string
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    withOwnAccount(userId, (user) => {
        if (!user.password) return generateReject(422, [t(wrongKey)]);

        return verifyPassword(password, user.password).then((doMatch) =>
            doMatch ? generateSuccess<UserDocument>(user) : generateReject(422, [t(wrongKey)])
        );
    });
