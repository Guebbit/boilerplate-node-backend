/**
 * @module
 * The one-time tokens an account holds in `verificationtokens` — reset, verification, deletion
 * confirmation, email-change and its undo, and the login's MFA challenge. "Live" is defined once
 * here. Finding and spending are separate for `two-factor-challenge.ts` and the password reset,
 * which check something between the two; {@link redeemLiveToken} composes them for the confirm
 * flows that don't. Spending always happens in the same transaction as the action it unlocks
 * ({@link spendThen}) — a refusal never says why.
 */

import { randomBytes } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import type { CallerContext } from '@types';
import { nudgeOutbox } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { recordAudit } from '@infrastructure/observability/audit';
import { hashToken } from '@infrastructure/security/hash-token';
import { accountAuditActions } from '../audit';
import { authOneTimeTokenRejectedTotal } from '../metrics';
import { type UserDocument } from '@modules/users';
import { accountUserService } from '@modules/users/friends/account';
import { verificationTokenRepository, type VerificationTokenRow } from '../repository';
import type { VerificationTokenType } from '../token-types';
import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';

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
 * @internal Mints a credential for any account; only this module's flows may, so it stays off `accountService`.
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
              accountUserService
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
 * @internal Resolves a link to its account; only this module's confirm flows may, so it stays off `accountService`.
 */
export const findLiveToken = (
    type: VerificationTokenType,
    token: string
): Promise<UserDocument | undefined> =>
    findLiveTokenEntry(type, token).then((found) => found?.user);

/**
 * Spend a token found by {@link findLiveToken}, inside the transaction that carries the action the
 * link unlocks. The row is deleted, and of two simultaneous uses of one link only one deletes
 * anything.
 *
 * @param type - the kind the link must be
 * @param token - the token value from the link
 * @param session - the transaction the action's own writes share
 * @returns `true` only for the request whose own write removed the row. A `false` here is the
 *   loser of a race between two simultaneous uses of one link, and is answered exactly like a
 *   token that never existed.
 * @internal Burns a link; only this module's confirm flows may, so it stays off `accountService`.
 */
export const spendLiveToken = (
    type: VerificationTokenType,
    token: string,
    session: ClientSession
): Promise<boolean> => verificationTokenRepository.spend(type, hashToken(token), session);

/**
 * Spend a link and do its action in ONE transaction: both commit, or neither does. A write that
 * fails (a connection reset, a duplicate key) rolls the spend back with it, so the link is still
 * live for a retry. Nothing that is not a database write belongs in `act`: the driver may run it
 * again on a transient error, and a mail or an audit row would go out twice. Those, the session-row
 * cleanup and the outbox wake-up all run after this resolves.
 *
 * The outbox nudge fires for every won spend, including an `act` that announced nothing: waking
 * the relay with nothing new to read is harmless.
 *
 * Why not "act, then delete the token": two requests would both act (a password reset is unsafe
 * that way). Why not "delete, then act": a crash between the two burns the link for nothing.
 * See docs/modules/account-sessions.md#spending-a-link.
 *
 * @param type - the kind the link must be
 * @param token - the token value from the link
 * @param act - the action's writes; pass `session` to every one
 * @returns what `act` resolved with, or `undefined` when this request did not win the spend. An
 *   `act` must therefore resolve with something other than `undefined`
 * @internal Burns a link; only this module's confirm flows may, so it stays off `accountService`.
 */
export const spendThen = <T>(
    type: VerificationTokenType,
    token: string,
    act: (session: ClientSession) => Promise<T>
): Promise<T | undefined> =>
    withTransaction((session) =>
        spendLiveToken(type, token, session).then((spent) => (spent ? act(session) : undefined))
    ).then((result) => {
        // After the commit: the relay must not look for rows that are not visible yet.
        if (result !== undefined) nudgeOutbox();
        return result;
    });

/**
 * {@link findLiveToken} then {@link spendThen}, for a confirm controller whose action is one
 * transaction on the holder. The password reset and the MFA challenge are not one of these: they
 * check something between the find and the spend, so they call the two halves themselves.
 *
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @param act - the action's writes on the holder; pass `session` to every one
 * @returns what `act` resolved with, once THIS request's spend removed the row — `undefined` for
 *   every kind of refusal, including the losing side of a race between two uses of one link
 * @internal Turns a link into its action; only this module's confirm flows may, so it stays off `accountService`.
 */
export const redeemLiveToken = <T>(
    type: VerificationTokenType,
    token: string,
    act: (user: UserDocument, session: ClientSession) => Promise<T>
): Promise<T | undefined> =>
    findLiveToken(type, token).then((user) =>
        user ? spendThen(type, token, (session) => act(user, session)) : undefined
    );

/** The confirm flows that spend a one-time link token. */
export type OneTimeTokenFlow =
    | 'password_reset'
    | 'email_verify'
    | 'email_change'
    | 'email_change_undo'
    | 'account_restore';

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

/**
 * The 422 every dead confirm link answers with, counted and audited. Unknown, expired and already
 * used read alike on purpose: a caller must not be able to tell them apart.
 *
 * @param context - the caller context of the refused request
 * @param flow - which confirm flow refused the link
 * @param messageKey - the flow's own "token not found" copy
 */
export const refuseLink = (
    context: CallerContext,
    flow: OneTimeTokenFlow,
    messageKey: string
): ResponseReject => {
    recordOneTimeTokenRejected(context, flow);
    return generateReject(422, [t(messageKey)]);
};
