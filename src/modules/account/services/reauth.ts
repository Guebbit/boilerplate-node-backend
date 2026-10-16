/**
 * @module
 * Step-up re-authentication: which ways an account has to prove "it is still me", the mailed code
 * for an account with no password, and the check behind `POST /account/reauth`.
 *
 * Password account:    proves the password.
 * OAuth-only account:  has no password, so it proves control of its verified mailbox instead.
 * Why that is enough:  forgot-password already hands that mailbox a way in, so a mailed code adds no
 *                      new trust. See docs/modules/account-sessions.md.
 *
 * Re-minting the session stays the controller's job (`../session/session.ts`); this only decides.
 */

import { verifyPassword } from '@infrastructure/security/password-hash';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { recordAudit } from '@infrastructure/observability/audit';
import { userService, type DeliveredCodeState, type UserDocument } from '@modules/users';
import type {
    CallerContext,
    ReauthMethod,
    ReauthMethods,
    ReauthRequest,
    TwoFactorDelivery
} from '@types';
import { accountAuditActions } from '../audit';
import { reauthCodeEmail } from '../emails';
import { deliveryCooldownRemaining, twoFactorMethod, verifyDeliveredCode } from '../two-factor';
import { deliverEmailCode } from '../two-factor/methods/email';
import { tooSoon } from './two-factor-outcomes';
import { proveSecondFactor } from './two-factor-lockout';
import { AMR } from '../domain/session-proof';
import { withOwnAccount } from './caller';

/**
 * The RFC 8176 `amr` value each method earns the session. `email` is this app's own value, not a
 * registered one (RFC 8176 leaves values context-specific): `otp` means a second factor here, and
 * a mailed step-up code is not one.
 */
const AMR_OF_METHOD: Record<ReauthMethod, string> = { password: AMR.password, email: AMR.email };

/**
 * The session's `amr` after a re-authentication: ONLY what this re-authentication proved. Proofs
 * from the login are not carried over: `auth_time` is refreshed, and a refreshed `auth_time` must
 * not vouch for a second factor nobody typed this time (a password-only re-auth that kept `otp`
 * would pass a route that demands one).
 *
 * @param method - the method just proved
 * @param otpProven - whether a second-factor code was verified in the same call
 */
export const amrAfterReauth = (method: ReauthMethod, otpProven: boolean): string[] => [
    AMR_OF_METHOD[method],
    ...(otpProven ? [AMR.otp] : [])
];

/** What a verified re-authentication hands the controller: the `amr` its new session earns. */
export interface ReauthProven {
    amr: string[];
}

/**
 * Which methods this account can use right now, in the order to offer them.
 *
 * @param user - the account, carrying its credentials
 */
const methodsOf = (user: UserDocument): ReauthMethod[] => {
    if (user.password) return ['password'];
    // The same two facts the email second factor asks: a verified address, and a deployment that
    // can deliver to it (an unset SMTP host makes `twoFactorMethod` answer undefined).
    return user.verifiedAt && twoFactorMethod('email') ? ['email'] : [];
};

/** A storage failure in these flows answers the shared database envelope, never a bare 500. */
const rejectAuthFailure = (error: unknown) => rejectDatabaseEnvelope('auth', error);

/**
 * `GET /account/reauth` — the methods this account can answer a step-up challenge with.
 *
 * @param userId - the caller
 */
export const reauthMethods = (
    userId: string
): Promise<ResponseSuccess<ReauthMethods> | ResponseReject> =>
    withOwnAccount(userId, (user) => generateSuccess({ methods: methodsOf(user) })).catch(
        rejectAuthFailure
    );

/**
 * Mint a code on the account, mail it, and persist its digest. The mail is queued before the
 * write, like the second-factor send: a queue that refuses leaves nothing armed.
 */
const deliverCode = (
    user: UserDocument,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorDelivery>> => {
    user.reauthCode = {};
    // Read back: Mongoose hydrates the assigned object into a subdocument, and that is the one
    // the helpers must mutate.
    const slot: DeliveredCodeState = user.reauthCode;

    return deliverEmailCode(user, slot, context, reauthCodeEmail)
        .then((delivery) => userService.armReauthCode(user).then(() => delivery))
        .then((delivery) => generateSuccess(delivery));
};

/**
 * `POST /account/reauth/methods/{method}/send` — mails the caller a step-up code. Only an account
 * that can use `method` gets one: a password account is refused, so the route cannot be used to
 * mail a code nobody asked for to an account that has a better proof.
 *
 * @param userId - the caller
 * @param method - the method to deliver through
 * @param context - caller context; the mail needs its locale
 */
export const sendReauthCode = (
    userId: string,
    method: ReauthMethod,
    context: CallerContext
): Promise<ResponseSuccess<TwoFactorDelivery> | ResponseReject> =>
    withOwnAccount(userId, (user) => {
        if (method === 'password' || !methodsOf(user).includes(method))
            return Promise.resolve(generateReject(422, [t('account.reauth.method-unavailable')]));

        const wait = deliveryCooldownRemaining(user.reauthCode ?? {});
        if (wait > 0) return Promise.resolve(tooSoon(wait));

        return deliverCode(user, context);
    })
        .catch(rejectAuthFailure)
        .then((result) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_REAUTH_CODE_SENT,
                outcome: result.success ? 'success' : 'failure',
                metadata: { method }
            });
            return result;
        });

/** Whether the typed password matches; an account with none never does. */
const passwordMatches = (user: UserDocument, password: string): Promise<boolean> =>
    // argon2id: compares a plaintext against the stored hash, salt and cost read from the hash itself.
    user.password ? verifyPassword(password, user.password) : Promise.resolve(false);

/**
 * Check a typed code against the one in flight. A wrong guess is counted and a right one spent by
 * conditional writes, so parallel requests can neither spend one code twice nor outrun the ceiling.
 */
const codeMatches = (user: UserDocument, code: string): Promise<boolean> =>
    verifyDeliveredCode(user, { kind: 'reauth' }, user.reauthCode, code);

/**
 * Prove whichever method the body names. Refuses a method the account does not have before
 * comparing anything: a password account cannot be passed with a mailed code, nor an account with
 * no password with a password it never set.
 */
const proveMethod = (
    user: UserDocument,
    proof: ReauthRequest
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    if (!methodsOf(user).includes(proof.method))
        return Promise.resolve(
            generateReject(422, [
                t(
                    user.password
                        ? 'account.reauth.method-unavailable'
                        : 'account.reauth.no-password'
                )
            ])
        );

    const proved =
        proof.method === 'password'
            ? passwordMatches(user, proof.password)
            : codeMatches(user, proof.code);
    return proved.then((doMatch) =>
        doMatch
            ? generateSuccess<UserDocument>(user)
            : generateReject(422, [
                  proof.method === 'password'
                      ? t('account.reauth.wrong-password')
                      : t('account.reauth.wrong-code')
              ])
    );
};

/**
 * The `otp` half of a re-authentication, run only once the primary method passed: a caller without
 * the password never gets to spend an attempt on the second factor. No `otp` in the body is not a
 * failure: the session simply earns no `otp`, and a route that demands one asks again.
 */
const proveOtp = (
    user: UserDocument,
    proof: ReauthRequest,
    context: CallerContext
): Promise<ResponseSuccess<ReauthProven> | ResponseReject> => {
    if (proof.otp === undefined)
        return Promise.resolve(generateSuccess({ amr: amrAfterReauth(proof.method, false) }));

    return proveSecondFactor(user, proof.otp, context).then((proved) =>
        proved.success ? generateSuccess({ amr: amrAfterReauth(proof.method, true) }) : proved
    );
};

/**
 * Re-authenticate an already-signed-in caller — the verification half of `POST /account/reauth`.
 * Proves the method, then the second-factor code when one was sent, and audits the attempt; re-minting the session (a fresh `auth_time`) is the
 * CONTROLLER's job, the same split `passwordChange` keeps from `postPasswordChange`.
 *
 * Not `login`'s path: its dummy-compare exists to stop an ANONYMOUS caller telling "no such
 *               account" from "wrong password" by timing. The access token already names who asks.
 * Not re-checked: the active/deletedAt gate `isAuth` already ran for this request.
 *
 * @param userId - the caller's own id, from their already-verified access token
 * @param proof - the tagged body: a password, or the code mailed to the account
 * @param context - for the audit record
 */
export const reauth = (
    userId: string,
    proof: ReauthRequest,
    context: CallerContext
): Promise<ResponseSuccess<ReauthProven> | ResponseReject> =>
    withOwnAccount(userId, (user) =>
        proveMethod(user, proof).then((proved) =>
            proved.success ? proveOtp(user, proof, context) : proved
        )
    )
        .catch(rejectAuthFailure)
        .then((result) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_REAUTHENTICATED,
                outcome: result.success ? 'success' : 'failure',
                metadata: { method: proof.method }
            });
            return result;
        });
