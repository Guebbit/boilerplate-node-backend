/**
 * @module
 * The second step of a login: build the challenge, deliver a code against it, verify the code.
 * Stops short of minting a session, like `login` in `./login` —
 * `../controllers/post-login-2fa.ts` turns a verified challenge into cookies.
 */

import { t } from '@infrastructure/i18n';
import { userService, type UserDocument } from '@modules/users';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import type { MfaChallenge, TwoFactorDelivery } from '@types';
import { accountAuditActions } from '../audit';
import { issueToken, findLiveTokenEntry, findLiveToken, spendLiveToken } from './tokens';
import { MFA_CHALLENGE_TOKEN_TYPE } from '../token-types';
import { deliveryCooldownRemaining } from '../two-factor';
import { audited, summarize, tooSoon } from './two-factor-outcomes';
import { armedEntries, verifyArmedFactor, settleVerdict } from './two-factor-lockout';

/** How long an MFA login challenge lives when every armed factor is read off a device — long enough to type six digits, no more. */
const MFA_CHALLENGE_TTL_MS = 300_000;

/**
 * The same, for an account with a DELIVERED factor armed. Double, because the window now has to
 * cover an SMTP queue, a spam filter and a person switching apps — five minutes is a window a
 * legitimate user loses races against, and a challenge that expires mid-login reads as the app
 * being broken.
 *
 * Exported for `../rate-limits.ts`, which windows the two MFA challenge budgets to this same
 * lifetime — a window can never end before the challenge it bounds.
 */
export const MFA_CHALLENGE_DELIVERED_TTL_MS = 600_000;

/**
 * The `{ mfaRequired, challenge, ... }` body `POST /account/login` answers with, for an account
 * that has 2FA on. Built here rather than in the controller because the challenge's LIFETIME
 * depends on which methods are armed — a mailed code has to survive a round-trip that a code read
 * off a screen does not.
 *
 * The challenge itself is the SAME single-use, revocable, hashed-at-rest mechanism
 * `password-reset` and account-deletion confirmation use (`verificationtokens`), not a
 * JWT: `verifyLoginChallenge` spends it via `spendLiveToken` on a right code, so a second
 * presentation of an already-answered challenge is refused outright, not merely re-checked.
 *
 * @param user - the account whose FIRST factor just checked out, with credentials loaded
 * @param amr - how that first factor was proven — `['pwd']` for a password login, `[provider]`
 *   for an OAuth one. Stored on the challenge so `verifyLoginChallenge` can hand it back once the
 *   second factor does too.
 * @returns the challenge payload, ready to send
 */
export const buildLoginChallenge = (
    user: UserDocument,
    amr: readonly string[]
): Promise<MfaChallenge> => {
    const armed = armedEntries(user);
    const ttlMs = armed.some(({ handler }) => handler.delivers)
        ? MFA_CHALLENGE_DELIVERED_TTL_MS
        : MFA_CHALLENGE_TTL_MS;
    return issueToken(user.id, MFA_CHALLENGE_TOKEN_TYPE, ttlMs, amr).then((token) => ({
        mfaRequired: true,
        challenge: token,
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        methods: armed.map(({ handler }) => summarize(handler, user)),
        ...(armed[0] && { defaultMethod: armed[0].handler.name })
    }));
};

/**
 * `POST /account/login/2fa/send` — delivers a code for one armed method, against a live
 * challenge. Public, like the rest of the login flow, which is exactly why the cooldown is
 * enforced here and not only in the route's limiter: this endpoint sends mail on an
 * unauthenticated caller's say-so.
 *
 * @param challenge - the challenge token from the first login step
 * @param method - which armed delivered method to send through
 */
export const sendLoginCode = (
    challenge: string,
    method: string,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorDelivery> | ResponseReject> => {
    const outcome = findLiveToken(MFA_CHALLENGE_TOKEN_TYPE, challenge)
        .then<ResponseSuccess<TwoFactorDelivery> | ResponseReject>((user) => {
            if (!user) return generateReject(401, [t('account.two-factor.challenge-invalid')]);

            const armed = armedEntries(user).find(({ handler }) => handler.name === method);
            // An unarmed method and an unknown one answer alike: a caller holding only a
            // challenge must not be able to enumerate what an account has enrolled
            // beyond what the challenge itself already told them.
            if (!armed?.handler.send)
                return generateReject(422, [t('account.two-factor.not-delivered')]);

            const wait = deliveryCooldownRemaining(armed.entry);
            if (wait > 0) return tooSoon(wait);

            return armed.handler
                .send(user, armed.entry, context)
                .then((delivery) =>
                    userService.persistTwoFactorMethods(user).then(() => generateSuccess(delivery))
                );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

    return audited(outcome, context, accountAuditActions.AUTH_2FA_CODE_SENT, method);
};

/** What a verified challenge hands back to `postLoginTwoFactor` — the account, and how its FIRST factor was proven, for the session about to be minted. */
export interface VerifiedChallenge {
    user: UserDocument;
    amr: readonly string[];
}

/**
 * `POST /account/login/2fa` — the second step of a 2FA login. Verifies the challenge and the code
 * against the account it names, but does NOT mint a session — see the module doc. A challenge
 * that fails to verify (missing, wrong type, expired) and an account with no 2FA enabled both
 * answer 401: neither should tell a caller which one they hit.
 *
 * @param challenge - the challenge token from the first login step
 * @param code - a code from any armed method, or an unused backup code
 */
export const verifyLoginChallenge = (
    challenge: string,
    code: string,
    context: CallerContext
): Promise<ResponseSuccess<VerifiedChallenge> | ResponseReject> => {
    const outcome = findLiveTokenEntry(MFA_CHALLENGE_TOKEN_TYPE, challenge)
        .then<ResponseSuccess<VerifiedChallenge> | ResponseReject>((found) => {
            if (!found) return generateReject(401, [t('account.two-factor.challenge-invalid')]);
            const { user, entry } = found;
            if (!user.twoFactorEnabledAt) return generateReject(401, []);

            return verifyArmedFactor(user, code, context).then((verdict) =>
                settleVerdict(verdict, user, () =>
                    // Right code: spend the challenge before minting anything. A wrong code leaves
                    // it live — `mfaChallengeLimiter` bounds how often it can be tried. Only the
                    // request whose own write removed it may mint: a concurrent twin is refused
                    // like a challenge that never existed.
                    spendLiveToken(MFA_CHALLENGE_TOKEN_TYPE, challenge).then(
                        (spentByThisRequest) =>
                            spentByThisRequest
                                ? userService.persistTwoFactorMethods(user).then((saved) =>
                                      generateSuccess({
                                          user: saved,
                                          amr: entry.amr ?? ['pwd']
                                      })
                                  )
                                : generateReject(401, [t('account.two-factor.challenge-invalid')])
                    )
                )
            );
        })
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error));

    // Failure only: a successful challenge is not itself a completed login — `postLoginTwoFactor`
    // fires `AUTH_LOGIN` once a session actually exists. Auditing success here too would claim a
    // login happened before it has.
    return outcome.then((result) => {
        if (!result.success)
            recordAudit(context, {
                action: accountAuditActions.AUTH_2FA_CHALLENGE_FAILED,
                outcome: 'failure'
            });
        return result;
    });
};
