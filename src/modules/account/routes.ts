/**
 * @module
 * Express router for the account module: auth (login, signup, refresh, logout), password reset,
 * email verification, sessions, and the address book. Destructive and session-eviction routes
 * (`DELETE /`, `POST /logout-all`, `DELETE /sessions/:sessionId`) and an email change on `PUT /`
 * additionally require a fresh session (`requireFreshAuth`/`requireFreshAuthWhen`).
 * See `./module.ts` for the mount point and `docs/modules/account.md` for the story.
 */

import type { Request } from 'express';
import { Router } from 'express';
import {
    credentialLimiters,
    uploadLimiter,
    mfaChallengeLimiter,
    mfaSendLimiter
} from '@infrastructure/http/middlewares/rate-limit';
import {
    getAuth,
    isAuth,
    isAdmin,
    requireFreshAuth,
    requireFreshAuthWhen,
    REAUTH_TIME_CRITICAL,
    REAUTH_TIME_SENSITIVE
} from '@kernel/middlewares/authorizations';
import { upload } from '@infrastructure/adapters/storage';
import { getAccount } from './controllers/get-account';
import { putAccount } from './controllers/put-account';
import { postLogin } from './controllers/post-login';
import { postSignup } from './controllers/post-signup';
import { postResetRequest } from './controllers/post-reset-request';
import { postResetConfirm } from './controllers/post-reset-confirm';
import { postPasswordChange } from './controllers/post-password-change';
import { postReauth } from './controllers/post-reauth';
import { postLoginTwoFactor } from './controllers/post-login-2fa';
import { postLoginTwoFactorSend } from './controllers/post-login-2fa-send';
import { get2fa } from './controllers/get-2fa';
import { post2faSetup } from './controllers/post-2fa-setup';
import { post2faConfirm } from './controllers/post-2fa-confirm';
import { delete2faMethod } from './controllers/delete-2fa-method';
import { delete2fa } from './controllers/delete-2fa';
import { getRefreshToken } from './controllers/get-refresh-token';
import { postLogout } from './controllers/post-logout';
import { postLogoutEverywhere } from './controllers/post-logout-everywhere';
import { getSessions } from './controllers/get-sessions';
import { deleteSession } from './controllers/delete-session';
import { postVerifyRequest } from './controllers/post-verify-request';
import { postVerifyConfirm } from './controllers/post-verify-confirm';
import { deleteExpiredTokens } from './controllers/delete-expired-tokens';
import { postAccountExport } from './controllers/post-account-export';
import { getAddresses } from './controllers/get-addresses';
import { postAddress, putAddress } from './controllers/write-addresses';
import { deleteAddress } from './controllers/delete-address';
import { deleteAccountRequest } from './controllers/delete-account-request';
import { deleteAccountConfirm } from './controllers/delete-account-confirm';
import { getOAuthProviders } from './controllers/get-oauth-providers';
import { getOAuthStart } from './controllers/get-oauth-start';
import { getOAuthCallback } from './controllers/get-oauth-callback';
import { invalidateCache, noStore } from '@infrastructure/http/middlewares/cache';

/**
 * Whether THIS `PUT /account` request is changing the caller's email — the one field
 * `requireFreshAuthWhen` gates on `PUT /`. Mirrors the exact comparison `putAccount` itself makes
 * (`email !== undefined && email !== currentEmail`), so the guard and the controller can never
 * disagree about what counts as an email change.
 *
 * MUST run after `upload.single('imageUpload')`: `PUT /account` accepts `multipart/form-data`,
 * so `request.body` does not exist until multer has parsed it — a predicate mounted earlier reads
 * an empty object, concludes "no email change", and gates nothing.
 */
const isChangingEmail = (request: Request): boolean => {
    const email = (request.body as { email?: string } | undefined)?.email;
    return email !== undefined && email !== request.authContext?.email;
};

/** Express router for account/auth endpoints (login, signup, password reset, token refresh). */
export const router = Router();

// All routes apply getAuth so request.authContext is populated when a token is present
router.use(getAuth);

/*
 * Credentials and auth-state changes: never cacheable. Mounted here rather than per controller so
 * a route added later cannot silently omit it — see `noStore`. Covers `GET /account` too,
 * deliberately: that route once also mounted `setCache`, whose `Cache-Control` REPLACES the
 * header this sets, so a browser cached the caller's own profile for an hour. `noStore` marks the
 * response and `setCache` now refuses to run on one it finds marked — see both in
 * `infrastructure/http/middlewares/cache.ts`.
 */
router.use(noStore);

// GET /account — current user profile (requires auth)
router.get('/', isAuth, getAccount);

// PUT /account — update own profile (requires auth). The upload mirrors signup's.
// requireFreshAuthWhen AFTER upload.single: see isChangingEmail's own doc for why the order is
// load-bearing. Sensitive tier, not critical: an unconditional gate here would ask for a
// password on every avatar upload — this route is the takeover path specifically BECAUSE of
// the email field, not the write in general.
router.put(
    '/',
    uploadLimiter,
    isAuth,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    requireFreshAuthWhen(isChangingEmail, REAUTH_TIME_SENSITIVE),
    putAccount
);

// DELETE /account — request account deletion (requires auth). Critical: destruction.
router.delete('/', isAuth, requireFreshAuth(REAUTH_TIME_CRITICAL), deleteAccountRequest);

// DELETE /account/delete-confirm — confirm account deletion with token
router.delete('/delete-confirm', invalidateCache(['users', 'account']), deleteAccountConfirm);

// POST /account/login — authenticate and get tokens
router.post('/login', credentialLimiters, postLogin);

// POST /account/signup — register new user
router.post(
    '/signup',
    credentialLimiters,
    uploadLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    postSignup
);

// POST /account/reset — request password reset email
router.post('/reset', credentialLimiters, postResetRequest);

// POST /account/reset-confirm — complete password reset with token
router.post(
    '/reset-confirm',
    credentialLimiters,
    invalidateCache(['users', 'account']),
    postResetConfirm
);

// POST /account/password — change password by proving the current one (requires auth)
router.post('/password', credentialLimiters, isAuth, postPasswordChange);

// POST /account/reauth — step-up: re-prove the password, refresh auth_time (requires auth)
router.post('/reauth', credentialLimiters, isAuth, postReauth);

// GET /account/refresh — create a new access token from the jwt cookie
router.get('/refresh', getRefreshToken);

// POST /account/logout — revoke THIS session's refresh token (cookie is the credential)
router.post('/logout', postLogout);

// POST /account/logout-all — revoke all refresh tokens (requires auth). Sensitive: evicting the
// owner is an attack, not just an action, if a stolen-but-unfresh session could do it.
router.post(
    '/logout-all',
    isAuth,
    requireFreshAuth(REAUTH_TIME_SENSITIVE),
    invalidateCache(['account']),
    postLogoutEverywhere
);

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

// GET /account/addresses — the caller's address book (requires auth)
router.get('/addresses', isAuth, getAddresses);

// POST /account/addresses — add an entry (requires auth)
router.post('/addresses', isAuth, postAddress);

// PUT /account/addresses/:addressId — update an entry (requires auth)
router.put('/addresses/:addressId', isAuth, putAddress);

// DELETE /account/addresses/:addressId — remove an entry (requires auth)
router.delete('/addresses/:addressId', isAuth, deleteAddress);

// POST /account/verify-request — re-send the verification email (requires auth)
router.post('/verify-request', credentialLimiters, isAuth, postVerifyRequest);

// POST /account/verify-confirm — spend the emailed token; public, the token is the credential
router.post(
    '/verify-confirm',
    credentialLimiters,
    invalidateCache(['users', 'account']),
    postVerifyConfirm
);

// DELETE /account/tokens/expired — remove expired tokens from the DB (admin only)
router.delete(
    '/tokens/expired',
    isAuth,
    isAdmin,
    invalidateCache(['users', 'account']),
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

// GET /account/oauth/providers — which providers this deployment has credentials for. Public,
// informational; registered ABOVE the `:provider` route below so it isn't swallowed by it.
router.get('/oauth/providers', getOAuthProviders);

// GET /account/oauth/:provider — 302 to the provider's consent screen. Public: this is how an
// OAuth session begins, same footing as /login and /signup.
router.get('/oauth/:provider', credentialLimiters, getOAuthStart);

// GET /account/oauth/:provider/callback — 302 back to the frontend, cookies set on success.
// Public: the provider's own code+state round trip is the credential.
router.get('/oauth/:provider/callback', credentialLimiters, getOAuthCallback);
