/**
 * @module
 * Email verification — issuing a token and sending the mail, in one place. Two KINDS of
 * verification share this mechanism — proving the address an account already has (signup, the
 * explicit re-send), and proving the address a `PUT /account` change has asked for
 * (docs/modules/account.md#proving-an-address) — and every flow that starts either one calls this
 * and nothing else, so they cannot drift. Old tokens of the SAME kind are removed before the new
 * one is issued — not for security, since spending any of them proves the same mailbox, but so "the
 * newest email is the one that works" and a re-send never confuses the user.
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { userRepository, TokenType, type UserDocument } from '@modules/users';
import { tokenAdd } from './authentication';
import { verifyRequestEmail } from '../emails';
import { generateSuccess, generateReject } from '@infrastructure/http/response';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';

/**
 * The `tokens.type` under which a signup/re-send verification token is stored — proves the
 * address the account ALREADY has.
 *
 * A string like `'password'` and `'delete'`, not an `TokenType` member: the enum names the two
 * types the JWT layer knows about, and this one belongs to the account endpoints alone — see the
 * note on `UserMethods.tokenAdd`.
 */
export const EMAIL_VERIFY_TOKEN_TYPE = 'verify';

/**
 * The `tokens.type` under which an email-CHANGE token is stored — proves the address a
 * `PUT /account` change has ASKED FOR (`user.pendingEmail`), never the one it already has. A
 * distinct type from {@link EMAIL_VERIFY_TOKEN_TYPE}, not a reuse: spending one must not do the
 * other's work, since a signup-verify token swapping in a `pendingEmail` would be a bug with an
 * account takeover on the end of it.
 */
export const EMAIL_CHANGE_TOKEN_TYPE = 'email-change';

/** How long a verification link works: 24 hours, in milliseconds. Shared by both token kinds. */
export const EMAIL_VERIFY_TOKEN_TTL_MS = 86_400_000;

/** The two kinds a token may be. A union of the constants, so a third one cannot be passed. */
type VerificationTokenType = typeof EMAIL_VERIFY_TOKEN_TYPE | typeof EMAIL_CHANGE_TOKEN_TYPE;

/**
 * Which address a token kind proves, and which frontend route its link points at — one lookup so
 * {@link sendVerificationEmail} cannot drift between a token's TYPE and the mailbox it targets.
 */
const VERIFICATION_TARGETS: Record<
    VerificationTokenType,
    { route: 'verify' | 'email-change'; addressOf: (user: UserDocument) => string | undefined }
> = {
    [EMAIL_VERIFY_TOKEN_TYPE]: { route: 'verify', addressOf: (user) => user.email },
    [EMAIL_CHANGE_TOKEN_TYPE]: { route: 'email-change', addressOf: (user) => user.pendingEmail }
};

/**
 * Issue a fresh verification token for `user` and enqueue the email carrying it.
 * @param user - the account to verify; must carry its credential fields (`tokens`), and
 *   `pendingEmail` too when `type` is {@link EMAIL_CHANGE_TOKEN_TYPE}
 * @param context - caller context; its `locale` is the fallback when the account has none
 * @param type - which address is being proven — defaults to the signup/re-send kind
 * @returns resolves when the job is queued — the send itself happens in the email worker
 */
export const sendVerificationEmail = (
    user: UserDocument,
    context: CallerContext,
    type: VerificationTokenType = EMAIL_VERIFY_TOKEN_TYPE
): Promise<void> => {
    const target = VERIFICATION_TARGETS[type];
    const address = target.addressOf(user);
    // Defensive: an `email-change` send with no `pendingEmail` set is a caller bug (nothing was
    // ever requested), not a state worth mailing about.
    if (!address) return Promise.resolve();

    return user
        .tokenRemoveAll(type)
        .then(() => tokenAdd(user, type, EMAIL_VERIFY_TOKEN_TTL_MS))
        .then((token) => {
            /*
             * The recipient's OWN language, exactly as the reset and delete emails choose
             * theirs: the copy is finished before the job is published, so the worker needs no
             * locale at all.
             */
            const mail = verifyRequestEmail(
                user.locale ?? context.locale ?? getDefaultLocale(),
                user.username,
                token,
                target.route
            );
            // High priority: a token-bearing link the user is actively waiting on, not a notification.
            return enqueueEmail(
                { to: address, subject: mail.subject },
                mail.template,
                mail.data,
                'high'
            );
        });
};

/**
 * The explicit re-send, `POST /account/verify-request` — the one of this function's three
 * callers that is a user asking for something, not a side effect of signup or an email change.
 * A wrapper around {@link sendVerificationEmail} rather than an emit inside it: signup and the
 * email-change path call that function too, and neither counts as "a request" for this audit action.
 */
export const requestEmailVerification = (
    user: UserDocument,
    context: CallerContext
): Promise<void> =>
    sendVerificationEmail(user, context).then(() => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_EMAIL_VERIFY_REQUESTED,
                outcome: 'success'
            })
        );
    });

/**
 * `POST /account/verify-request` end to end: loads the caller's own account, refuses the two
 * states that can't be verified, and sends. The refusals live here since
 * `requestEmailVerification` takes an already-loaded user and can't enforce its own precondition.
 * Unlike the reset request, there's no enumeration surface to blur: the caller is authenticated
 * and asking about their own account, so an already-verified one gets an honest 409, not a
 * soothing 200 that re-sends nothing.
 */
export const requestEmailVerificationFor = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    // Credentials included: issuing the token pushes onto this document's `tokens`.
    userRepository.findByIdWithCredentials(userId).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);
        if (user.verified) return generateReject(409, [t('account.verify.already-verified')]);

        return requestEmailVerification(user, context).then(() =>
            generateSuccess(undefined, 200, t('account.verify.email-sent'))
        );
    });

/**
 * Spend a verification token and mark the account verified.
 * `postVerifyConfirm` already found and spent the token — the race is settled by the atomic
 * `$pull` in `spendLiveToken` — so this is deliberately just the write and its emit, not a
 * second copy of that check. See `./tokens` for why finding and spending are two calls.
 */
export const completeEmailVerification = (
    user: UserDocument,
    context: CallerContext
): Promise<UserDocument> => {
    user.verified = true;
    return userRepository.save(user).then((saved) => {
        emitAuditEvent(
            buildAuditEvent(context, {
                action: accountAuditActions.AUTH_EMAIL_VERIFY_COMPLETED,
                actor_user_id: saved.id,
                actor_role: saved.admin ? 'admin' : 'user',
                outcome: 'success'
            })
        );
        return saved;
    });
};

/**
 * Spend an `email-change` token: swap `pendingEmail` into `email`, mark the account verified —
 * the new address just proved itself — and revoke every refresh token. `postEmailChangeConfirm`
 * already found and spent the token before calling this, same split as
 * {@link completeEmailVerification}.
 *
 * The revoke is deliberate: an email change is the stronger takeover primitive of the two, and
 * this is the same treatment `passwordChange` already gives a changed password
 * (docs/modules/account.md#proving-an-address). Its own failure is swallowed, not a rejection —
 * the swap already succeeded, and a lost revoke is defense in depth this codebase can afford to
 * lose once.
 * @param user - the token's holder, loaded with credentials (`pendingEmail`, `tokens`)
 * @param context - the caller context, for the audit record
 */
export const completeEmailChange = (
    user: UserDocument,
    context: CallerContext
): Promise<UserDocument> => {
    const newEmail = user.pendingEmail;
    // Defensive: `findLiveToken` only returns a holder of a live `email-change` token, and issuing
    // one always sets `pendingEmail` first — this is unreachable outside a caller bug.
    if (!newEmail) return Promise.resolve(user);

    user.email = newEmail;
    user.pendingEmail = undefined;
    user.verified = true;

    return userRepository.save(user).then((saved) =>
        saved
            .tokenRemoveAll(TokenType.REFRESH)
            .catch(() => undefined)
            .then(() => {
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: accountAuditActions.AUTH_EMAIL_CHANGE_COMPLETED,
                        actor_user_id: saved.id,
                        actor_role: saved.admin ? 'admin' : 'user',
                        outcome: 'success'
                    })
                );
                return saved;
            })
    );
};
