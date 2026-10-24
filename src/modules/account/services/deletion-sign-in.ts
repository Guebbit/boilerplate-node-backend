/**
 * @module
 * The sign-in side of the deletion grace: an account whose owner scheduled its erasure is not
 * given a session at login, it is given a claim check. Redeeming that check at
 * `POST /account/login/restore` cancels the deletion and starts the session.
 *
 * See: docs/theory/data-retention.md#self-deletion-a-grace-under-one-month
 */

import { isRestorable, type UserDocument } from '@modules/users';
import type { CallerContext, DeletionPending } from '@types';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { DELETION_RESTORE_TOKEN_TYPE } from '../token-types';
import { restoreAccount } from './account-deletion';
import { MFA_CHALLENGE_TTL_MS } from './two-factor-challenge';
import { findLiveTokenEntry, issueToken, spendLiveToken } from './tokens';

/**
 * The `DeletionPending` body a sign-in answers with for an account in its grace. Minted only
 * after every factor the account has passed, so the second factor is asked once.
 *
 * @param user - the account, with `purgeAt` set (`isRestorable`)
 * @param amr - how the sign-in was proven; stored on the claim check and handed to the session
 * @returns the body to answer with
 */
export const buildDeletionPending = (
    user: UserDocument,
    amr: readonly string[]
): Promise<DeletionPending> =>
    issueToken(user.id, DELETION_RESTORE_TOKEN_TYPE, MFA_CHALLENGE_TTL_MS, amr).then(
        (challenge) => ({
            deletionPending: true,
            challenge,
            expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS).toISOString(),
            // `isRestorable` guarantees it; the optional type is the schema's, for every other row.
            purgeAt: (user.purgeAt ?? new Date()).toISOString()
        })
    );

/** What a redeemed claim check hands back: the restored account and how it signed in. */
export interface RestoredSignIn {
    user: UserDocument;
    amr: readonly string[];
}

/**
 * Spend the claim check a live lookup found and restore its account, or refuse.
 *
 * @param found - the live claim check and its holder, when there was one
 * @param challenge - the claim check as presented, for the spend
 * @param context - the caller
 */
const redeem = (
    found: Awaited<ReturnType<typeof findLiveTokenEntry>>,
    challenge: string,
    context: CallerContext
): Promise<ResponseSuccess<RestoredSignIn> | ResponseReject> => {
    const refusal = generateReject(401, [t('account.login.restore-challenge-invalid')]);
    const amr = found?.entry.amr;
    if (!found || !amr || !isRestorable(found.user)) return Promise.resolve(refusal);
    const { user } = found;

    // Only the request whose own write removed the claim check may restore.
    return spendLiveToken(DELETION_RESTORE_TOKEN_TYPE, challenge).then((spent) =>
        spent
            ? restoreAccount(user, 'sign-in', context).then((restored) =>
                  restored ? generateSuccess({ user, amr }) : refusal
              )
            : refusal
    );
};

/**
 * `POST /account/login/restore` — spend the claim check, cancel the deletion, and return what the
 * caller needs to mint the session. Every refusal answers 401 alike: unknown, expired, spent,
 * and an account whose grace ran out in the meantime.
 *
 * @param challenge - the claim check from the sign-in
 * @param context - the caller
 */
export const restoreAtSignIn = (
    challenge: string,
    context: CallerContext
): Promise<ResponseSuccess<RestoredSignIn> | ResponseReject> =>
    findLiveTokenEntry(DELETION_RESTORE_TOKEN_TYPE, challenge)
        .then((found) => redeem(found, challenge, context))
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));
