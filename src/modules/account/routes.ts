/**
 * @module
 * Express router for the account module: auth (login, signup, refresh, logout), password reset,
 * email verification, and sessions. The address book shares this router's `/account` prefix from
 * its own module — see `@modules/addresses/routes`. Destructive and session-eviction routes
 * (`DELETE /`, `POST /logout-all`, `DELETE /sessions/:sessionId`) and an email change on `PUT /`
 * additionally require a fresh session (`requireFreshAuth`/`requireFreshAuthWhen`).
 * See `./module.ts` for the mount point and `docs/modules/account.md` for the story.
 */

import type { Request } from 'express';
import { Router } from 'express';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import {
    credentialLimiters,
    signupLimiters,
    resetRequestLimiters,
    passwordCheckLimiter,
    mfaChallengeLimiter,
    mfaSendLimiter,
    accountCodeSendLimiter,
    loginChallengeGate
} from './rate-limits';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import {
    getAuth,
    isAuth,
    requirePermission,
    requireFreshAuth,
    requireFreshAuthWhen,
    REAUTH_TIME_CRITICAL,
    REAUTH_TIME_SENSITIVE
} from '@kernel/middlewares/authorizations';
import { upload } from '@infrastructure/http/middlewares/upload';
import { getAccount } from './controllers/get-account';
import { replaceAccount, updateAccount } from './controllers/update-account';
import { cancelPendingEmail } from './controllers/cancel-pending-email';
import { postLogin } from './controllers/post-login';
import { postSignup } from './controllers/post-signup';
import { postResetRequest } from './controllers/post-reset-request';
import { postResetConfirm } from './controllers/post-reset-confirm';
import { postPasswordChange } from './controllers/post-password-change';
import { postPasswordCheck } from './controllers/post-password-check';
import { postReauth } from './controllers/post-reauth';
import { postLoginTwoFactor } from './controllers/post-login-2fa';
import { postLoginTwoFactorSend } from './controllers/post-login-2fa-send';
import { get2fa } from './controllers/get-2fa';
import { post2faSetup } from './controllers/post-2fa-setup';
import { post2faConfirm } from './controllers/post-2fa-confirm';
import { post2faMethodSend } from './controllers/post-2fa-method-send';
import { delete2faMethod } from './controllers/delete-2fa-method';
import { delete2fa } from './controllers/delete-2fa';
import { post2faBackupCodes } from './controllers/post-2fa-backup-codes';
import { getRefreshToken } from './controllers/get-refresh-token';
import { postLogout } from './controllers/post-logout';
import { postLogoutEverywhere } from './controllers/post-logout-everywhere';
import { getSessions } from './controllers/get-sessions';
import { deleteSession } from './controllers/delete-session';
import { postVerifyRequest } from './controllers/post-verify-request';
import { postVerifyConfirm } from './controllers/post-verify-confirm';
import { postEmailChangeConfirm } from './controllers/post-email-change-confirm';
import { deleteExpiredTokens } from './controllers/delete-expired-tokens';
import { postAccountExport } from './controllers/post-account-export';
import { deleteAccountRequest } from './controllers/delete-account-request';
import { deleteAccountConfirm } from './controllers/delete-account-confirm';
import { getOAuthProviders } from './controllers/get-oauth-providers';
import { getOAuthStart } from './controllers/get-oauth-start';
import { getOAuthCallback } from './controllers/get-oauth-callback';
import { noStore } from '@infrastructure/http/middlewares/cache';
import { getMyAbilities } from './controllers/get-my-abilities';
import { normalizeEmail } from '@modules/users';

/**
 * Whether THIS request is changing the caller's email — the one field `requireFreshAuthWhen`
 * gates on `PUT /` and `PATCH /`. Case-insensitive, the same way `accountService.updateProfile`'s
 * own `applyEmailChangeRequest` compares (`normalizeEmail`), so the guard and the service can
 * never disagree about what counts as an email change — a mixed-case resend of the current
 * address must not demand a step-up the service itself treats as a no-op.
 *
 * MUST run after `upload.image()`: both verbs accept `multipart/form-data`, so `request.body`
 * does not exist until multer has parsed it — a predicate mounted earlier reads an empty object,
 * concludes "no email change", and gates nothing.
 *
 * Not exported: a wiring file's own predicate is asserted through `PUT /account` itself — whether
 * a stale session is challenged or not — never by calling this directly (PL-30).
 */
const isChangingEmail = (request: Request): boolean => {
    const email = (request.body as { email?: string } | undefined)?.email;
    if (email === undefined) return false;
    const currentEmail = request.authContext?.email;
    return currentEmail === undefined || normalizeEmail(email) !== normalizeEmail(currentEmail);
};

/** Express router for account/auth endpoints (login, signup, password reset, token refresh). */
export const router = Router();

// All routes apply getAuth so request.authContext is populated when a token is present
router.use(getAuth);

/*
 * Credentials and auth-state changes: never cacheable. Mounted here rather than per controller so
 * a route added later cannot silently omit it — see `noStore`. Covers `GET /account` too,
 * deliberately: `setCache`'s `Cache-Control` REPLACES the header this sets, so a route mounting
 * both would cache the caller's own profile for an hour. `noStore` marks the response and
 * `setCache` refuses to run on one it finds marked — see both in
 * `infrastructure/http/middlewares/cache.ts`.
 */
router.use(noStore);

// GET /account — current user profile (requires auth)
router.get('/', isAuth, getAccount);

// PUT /account (replace) and PATCH /account (merge) — own profile, requires auth. The upload
// mirrors signup's. requireFreshAuthWhen AFTER upload.image(): see isChangingEmail's own doc for
// why the order is load-bearing. Sensitive tier, not critical: an unconditional gate here would
// ask for a password on every avatar upload — this route is the takeover path specifically
// BECAUSE of the email field, not the write in general.
router.put(
    '/',
    uploadLimiter,
    isAuth,
    upload.image(),
    requireFreshAuthWhen(isChangingEmail, REAUTH_TIME_SENSITIVE),
    replaceAccount
);
router.patch(
    '/',
    uploadLimiter,
    isAuth,
    upload.image(),
    requireFreshAuthWhen(isChangingEmail, REAUTH_TIME_SENSITIVE),
    updateAccount
);

// DELETE /account/pending-email — cancel a pending email change (requires auth). No fresh-auth
// gate: it only discards a change, the same trust level as reading the profile that shows it.
router.delete('/pending-email', isAuth, cancelPendingEmail);

// DELETE /account — request account deletion (requires auth). Critical: destruction.
router.delete('/', isAuth, requireFreshAuth(REAUTH_TIME_CRITICAL), deleteAccountRequest);

// DELETE /account/delete-confirm — confirm account deletion with token
router.delete('/delete-confirm', deleteAccountConfirm);

// POST /account/login — authenticate and get tokens. `loginChallengeGate` (rung 3, off by
// default) only engages once `credentialLimiters`' identity budget is mostly spent — never on an
// honest first attempt, see rate-limits.ts.
router.post('/login', credentialLimiters, loginChallengeGate, postLogin);

// POST /account/signup — register new user. `signupLimiters`, not `credentialLimiters`: the
// abuse here (a Sybil account) gets a 201, which `credentialLimiters`' skipSuccessfulRequests
// would spend nothing on — see rate-limits.ts. `humanChallengeGate` is rung 3, off by default.
// JSON only: no upload middleware is mounted, because a stranger writes nothing to the image store
// before registering — the avatar is a follow-up `PATCH /account` from the signed-in session.
router.post('/signup', signupLimiters, humanChallengeGate, idempotencyKey, postSignup);

// POST /account/reset — request password reset email. `resetRequestLimiters`, same reasoning as
// signup: this route always answers 200, so only a budget spent by success bounds anything.
router.post('/reset', resetRequestLimiters, humanChallengeGate, postResetRequest);

// POST /account/reset-confirm — complete password reset with token
router.post('/reset-confirm', credentialLimiters, postResetConfirm);

// POST /account/password — change password by proving the current one (requires auth).
// `isAuth` runs BEFORE `credentialLimiters` here, on /reauth and on /verify-request: the body
// names no account, so the identity budget can only be per account if it reads the session's.
router.post('/password', isAuth, credentialLimiters, postPasswordChange);

// POST /account/password/check — advisory breach check, unauthenticated (signup needs it before
// an account exists). `passwordCheckLimiter`, not `credentialLimiters`: this body carries no
// email/username, so `credentialLimiters`' identity key would fall back to the caller's address
// block. Address-keyed directly instead, like `submissionLimiter`.
router.post('/password/check', passwordCheckLimiter, postPasswordCheck);

// POST /account/reauth — step-up: re-prove the password, refresh auth_time (requires auth)
router.post('/reauth', isAuth, credentialLimiters, postReauth);

/*
 * GET /account/abilities — the rules the server enforces, for a client to render from.
 *
 * No guard beyond the router-wide `router.use(getAuth)` above: a stranger has rules too (the
 * `guest` role), and a shop front that greys nothing out for a visitor is a shop front that lies
 * twice. Not mounted a second time here — `getAuth` already ran for every route on this router
 * and already stashed `request.authContext`; `getMyAbilities` reads that directly.
 */
router.get('/abilities', getMyAbilities);

// GET /account/refresh — create a new access token from the jwt cookie
router.get('/refresh', getRefreshToken);

// POST /account/logout — revoke THIS session's refresh token (cookie is the credential)
router.post('/logout', postLogout);

// POST /account/logout-all — revoke all refresh tokens (requires auth). Sensitive: evicting the
// owner is an attack, not just an action, if a stolen-but-unfresh session could do it.
router.post('/logout-all', isAuth, requireFreshAuth(REAUTH_TIME_SENSITIVE), postLogoutEverywhere);

// GET /account/sessions — list live refresh tokens as sessions (requires auth)
router.get('/sessions', isAuth, getSessions);

// DELETE /account/sessions/:sessionId — revoke one session (requires auth). Sensitive, same
// reasoning as logout-all.
router.delete(
    '/sessions/:sessionId',
    isAuth,
    requireFreshAuth(REAUTH_TIME_SENSITIVE),
    deleteSession
);

// POST /account/verify-request — re-send the verification email (requires auth)
router.post('/verify-request', isAuth, credentialLimiters, postVerifyRequest);

// POST /account/verify-confirm — spend the emailed token; public, the token is the credential
router.post('/verify-confirm', credentialLimiters, postVerifyConfirm);

// POST /account/email-change-confirm — spend the emailed `email-change` token; public, same
// reasoning as verify-confirm. A DIFFERENT token type — see `services/verification.ts`.
router.post('/email-change-confirm', credentialLimiters, postEmailChangeConfirm);

// DELETE /account/tokens/expired — remove expired tokens from the DB (`tokens.any.delete`)
router.delete(
    '/tokens/expired',
    isAuth,
    requirePermission('tokens.any.delete'),
    deleteExpiredTokens
);

// POST /account/export — the caller's full data export. Sensitive tier: requireFreshAuth is the
// identity proof here, not a bespoke password check in the body.
router.post('/export', isAuth, requireFreshAuth(REAUTH_TIME_SENSITIVE), postAccountExport);

// POST /account/login/2fa/send — mail a login code. Registered ABOVE `/login/2fa` so the more
// specific path is matched first. Public like /login, and limited twice over: this is the only
// 2FA route an unauthenticated caller can make this deployment send mail with.
router.post('/login/2fa/send', credentialLimiters, mfaSendLimiter, postLoginTwoFactorSend);

// POST /account/login/2fa — the second step of a 2FA login. Public, like /login
// itself: the challenge token is the credential. `mfaChallengeLimiter` bounds guesses against
// ONE challenge; `credentialLimiters` is defense in depth on top of it.
router.post('/login/2fa', credentialLimiters, mfaChallengeLimiter, postLoginTwoFactor);

// GET /account/2fa — the caller's own factors. Plain `isAuth`: reading your own 2FA status
// reveals nothing a step-up would protect, and the profile page needs it on every visit.
router.get('/2fa', isAuth, get2fa);

// DELETE /account/2fa — drop every factor. Critical fresh auth AND a valid code in the body:
// disabling from a stolen-but-fresh session is otherwise the cheapest way around the feature.
router.delete('/2fa', isAuth, requireFreshAuth(REAUTH_TIME_CRITICAL), delete2fa);

// POST /account/2fa/methods/:method/setup — start (or restart) one method's enrollment. Critical
// tier: a restart disarms a factor that was already working.
router.post(
    '/2fa/methods/:method/setup',
    isAuth,
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    post2faSetup
);

// POST /account/2fa/methods/:method/send — mail a signed-in caller a code for an ARMED delivered
// method, so an email-only account can prove itself before changing its factors. Critical tier,
// like the calls it serves, and its own per-account delivery budget (mail is what it spends).
router.post(
    '/2fa/methods/:method/send',
    isAuth,
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    accountCodeSendLimiter,
    post2faMethodSend
);

// POST /account/2fa/methods/:method/confirm — arm the pending method. Critical, same reasoning.
router.post(
    '/2fa/methods/:method/confirm',
    isAuth,
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    post2faConfirm
);

// DELETE /account/2fa/methods/:method — drop one factor, keep the rest. Registered LAST of the
// three so the two longer paths above are matched first.
router.delete(
    '/2fa/methods/:method',
    isAuth,
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    delete2faMethod
);

// POST /account/2fa/backup-codes — mint a fresh set of ten, discarding the old ones. Critical
// tier, same reasoning as disable: the old set stops being a stolen-but-fresh session's shortcut
// around whichever factor is actually armed.
router.post(
    '/2fa/backup-codes',
    isAuth,
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    post2faBackupCodes
);

// GET /account/oauth/providers — which providers this deployment has credentials for. Public,
// informational; registered ABOVE the `:provider` route below so it isn't swallowed by it.
router.get('/oauth/providers', getOAuthProviders);

// GET /account/oauth/:provider — 302 to the provider's consent screen. Public: this is how an
// OAuth session begins, same footing as /login and /signup.
router.get('/oauth/:provider', credentialLimiters, getOAuthStart);

// GET /account/oauth/:provider/callback — 302 back to the frontend, cookies set on success.
// Public: the provider's own code+state round trip is the credential.
router.get('/oauth/:provider/callback', credentialLimiters, getOAuthCallback);
