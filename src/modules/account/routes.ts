import { Router } from 'express';
import { authRateLimiter } from '@infrastructure/http/middlewares/security';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { upload } from '@infrastructure/adapters/storage';
import { getAccount } from './controllers/get-account';
import { putAccount } from './controllers/put-account';
import { postLogin } from './controllers/post-login';
import { postSignup } from './controllers/post-signup';
import { postResetRequest } from './controllers/post-reset-request';
import { postResetConfirm } from './controllers/post-reset-confirm';
import { postPasswordChange } from './controllers/post-password-change';
import { getRefreshToken } from './controllers/get-refresh-token';
import { postLogout } from './controllers/post-logout';
import { postLogoutEverywhere } from './controllers/post-logout-everywhere';
import { getSessions } from './controllers/get-sessions';
import { deleteSession } from './controllers/delete-session';
import { postVerifyRequest } from './controllers/post-verify-request';
import { postVerifyConfirm } from './controllers/post-verify-confirm';
import { deleteExpiredTokens } from './controllers/delete-expired-tokens';
import { getAddresses } from './controllers/get-addresses';
import { postAddress, putAddress } from './controllers/write-addresses';
import { deleteAddress } from './controllers/delete-address';
import { deleteAccountRequest } from './controllers/delete-account-request';
import { deleteAccountConfirm } from './controllers/delete-account-confirm';
import { invalidateCache, noStore } from '@infrastructure/http/middlewares/cache';

/** Express router for account/auth endpoints (login, signup, password reset, token refresh). */
export const router = Router();

// All routes apply getAuth so request.authContext is populated when a token is present
router.use(getAuth);

/*
 * Credentials and auth-state changes: never cacheable. Mounted here rather than per controller so
 * a route added later cannot silently omit it — see `noStore`.
 *
 * It covers `GET /account` too, deliberately. That route once also mounted `setCache`, whose
 * `response.set('Cache-Control', …)` REPLACES the header this sets — so the one router-wide
 * guarantee was silently off for the one route serving the caller's own profile, and a browser
 * stored it for an hour. A profile is the caller's identity: `no-store` is the answer, and the
 * read is one indexed lookup.
 *
 * That combination can no longer recur silently: `noStore` marks the response, and `setCache`
 * refuses to run on one it finds marked — see both in `infrastructure/http/middlewares/cache.ts`.
 */
router.use(noStore);

// GET /account — current user profile (requires auth)
router.get('/', isAuth, getAccount);

// PUT /account — update own profile (requires auth). The upload mirrors signup's.
router.put(
    '/',
    isAuth,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    putAccount
);

// DELETE /account — request account deletion (requires auth)
router.delete('/', isAuth, deleteAccountRequest);

// DELETE /account/delete-confirm — confirm account deletion with token
router.delete('/delete-confirm', invalidateCache(['users', 'account']), deleteAccountConfirm);

// POST /account/login — authenticate and get tokens
router.post('/login', authRateLimiter, postLogin);

// POST /account/signup — register new user
router.post(
    '/signup',
    authRateLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    postSignup
);

// POST /account/reset — request password reset email
router.post('/reset', authRateLimiter, postResetRequest);

// POST /account/reset-confirm — complete password reset with token
router.post(
    '/reset-confirm',
    authRateLimiter,
    invalidateCache(['users', 'account']),
    postResetConfirm
);

// POST /account/password — change password by proving the current one (requires auth)
router.post('/password', authRateLimiter, isAuth, postPasswordChange);

// GET /account/refresh — create a new access token from the jwt cookie
router.get('/refresh', getRefreshToken);

// POST /account/logout — revoke THIS session's refresh token (cookie is the credential)
router.post('/logout', postLogout);

// POST /account/logout-all — revoke all refresh tokens (requires auth)
router.post('/logout-all', isAuth, invalidateCache(['account']), postLogoutEverywhere);

// GET /account/sessions — list live refresh tokens as sessions (requires auth)
router.get('/sessions', isAuth, getSessions);

// DELETE /account/sessions/:sessionId — revoke one session (requires auth)
router.delete('/sessions/:sessionId', isAuth, deleteSession);

// GET /account/addresses — the caller's address book (requires auth)
router.get('/addresses', isAuth, getAddresses);

// POST /account/addresses — add an entry (requires auth)
router.post('/addresses', isAuth, postAddress);

// PUT /account/addresses/:addressId — update an entry (requires auth)
router.put('/addresses/:addressId', isAuth, putAddress);

// DELETE /account/addresses/:addressId — remove an entry (requires auth)
router.delete('/addresses/:addressId', isAuth, deleteAddress);

// POST /account/verify-request — re-send the verification email (requires auth)
router.post('/verify-request', authRateLimiter, isAuth, postVerifyRequest);

// POST /account/verify-confirm — spend the emailed token; public, the token is the credential
router.post(
    '/verify-confirm',
    authRateLimiter,
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
