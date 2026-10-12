/**
 * @module
 * The one-time tokens an account holds in `verificationtokens` — reset, verification, deletion
 * confirmation, email-change and its undo, and the login's MFA challenge. "Live" is defined once
 * here. {@link findLiveToken}/{@link spendLiveToken} stay separate for `two-factor-challenge.ts`
 * and the password reset, which do other work between finding a token and spending it;
 * {@link redeemLiveToken} composes both for the confirm controllers that don't — a refusal never
 * says why.
 */

import { randomBytes } from 'node:crypto';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { hashToken } from '@infrastructure/security/hash-token';
import { accountAuditActions } from '../audit';
import { authOneTimeTokenRejectedTotal } from '../metrics';
import { userService, type UserDocument } from '@modules/users';
import { verificationTokenRepository, type VerificationTokenRow } from '../repository';
import type { VerificationTokenType } from '../token-types';

/**
 * Issue a one-time token for an account and return its plaintext, for the emailed link or the
 * challenge response only — storage keeps the digest. A kind that allows one live link replaces
 * the previous one in the same atomic write.
 *
 * @param userId - the account the token belongs to
 * @param type - which flow it is for
 * @param ttlMs - how long it works
 * @param amr - an MFA challenge only: how the first factor was proven
 * @returns the plaintext token
 */
export const issueToken = (
    userId: string,
    type: VerificationTokenType,
    ttlMs: number,
    amr?: readonly string[]
): Promise<string> => {
    // 128 bits: nothing to brute-force, and the entropy `hashToken`'s plain digest relies on.
    const token = randomBytes(16).toString('hex');
    const now = new Date();
    return verificationTokenRepository
        .issue({
            userId,
            type,
            tokenHash: hashToken(token),
            sentAt: now,
            expiresAt: new Date(now.getTime() + ttlMs),
            ...(amr && { amr: [...amr] })
        })
        .then(() => token);
};

/**
 * Remove every token of the given kinds an account holds.
 *
 * @param userId - the account
 * @param types - the kinds to remove
 */
export const removeTokens = (
    userId: string,
    types: readonly VerificationTokenType[]
): Promise<void> => verificationTokenRepository.removeOfTypes(userId, types);

/**
 * When the account was last sent a token of this kind, for a resend cooldown.
 *
 * @param userId - the account
 * @param type - the kind
 */
export const tokenSentAt = (
    userId: string,
    type: VerificationTokenType
): Promise<Date | undefined> => verificationTokenRepository.lastSentAt(userId, type);

/**
 * Find the account holding a LIVE token of this type, without spending it — and the row itself,
 * for the one caller that needs more than just its holder (`verifyLoginChallenge`, which reads
 * `entry.amr` back off an MFA challenge). Live means: exists, right type, not expired.
 *
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @returns the holder and the matched row, or `undefined` for every kind of refusal
 */
export const findLiveTokenEntry = (
    type: VerificationTokenType,
    token: string
): Promise<{ user: UserDocument; entry: VerificationTokenRow } | undefined> =>
    verificationTokenRepository.findLive(type, hashToken(token), new Date()).then((entry) =>
        entry
            ? // With credentials: every flow that finds a token goes on to change the account.
              userService
                  .findByIdWithCredentials(String(entry.userId))
                  .then((user) => (user ? { user, entry } : undefined))
            : undefined
    );

/**
 * {@link findLiveTokenEntry}, for the common case that only cares who holds the token.
 *
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @returns the holder, or `undefined` for every kind of refusal
 */
export const findLiveToken = (
    type: VerificationTokenType,
    token: string
): Promise<UserDocument | undefined> =>
    findLiveTokenEntry(type, token).then((found) => found?.user);

/**
 * Spend a token found by {@link findLiveToken}, atomically: the row is deleted, and of two
 * simultaneous uses of one link only one deletes anything.
 *
 * @param type - the kind the link must be
 * @param token - the token value from the link
 * @returns `true` only for the request whose own write removed the row. A `false` here is the
 *   loser of a race between two simultaneous uses of one link, and is answered exactly like a
 *   token that never existed.
 */
export const spendLiveToken = (type: VerificationTokenType, token: string): Promise<boolean> =>
    verificationTokenRepository.spend(type, hashToken(token));

/**
 * {@link findLiveToken} then {@link spendLiveToken}, for a confirm controller that has no work of
 * its own to do between the two. The password reset is not one of these: its breach check needs
 * the found user and must run before the spend, so `completePasswordReset` does the two halves
 * itself.
 *
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @returns the holder, once THIS request's spend removed the row — `undefined` for every kind of
 *   refusal, including the losing side of a race between two uses of one link
 */
export const redeemLiveToken = (
    type: VerificationTokenType,
    token: string
): Promise<UserDocument | undefined> =>
    findLiveToken(type, token).then((user) => {
        if (!user) return undefined;

        return spendLiveToken(type, token).then((spentByThisRequest) =>
            spentByThisRequest ? user : undefined
        );
    });

/** The four confirm flows that spend a one-time link token. */
export type OneTimeTokenFlow =
    | 'password_reset'
    | 'email_verify'
    | 'email_change'
    | 'account_delete';

/**
 * Count and audit one refused link token. `auth.` not `security.`: a customer with a stale or
 * mistyped link is the usual cause, so it does not page the platform operator.
 *
 * @param context - the caller context of the refused request
 * @param flow - which confirm flow refused it
 */
export const recordOneTimeTokenRejected = (
    context: CallerContext,
    flow: OneTimeTokenFlow
): void => {
    authOneTimeTokenRejectedTotal.inc({ flow });
    recordAudit(context, {
        action: accountAuditActions.AUTH_ONE_TIME_TOKEN_REJECTED,
        actorUserId: 'anonymous',
        actorRole: 'anonymous',
        outcome: 'failure',
        metadata: { flow }
    });
};
