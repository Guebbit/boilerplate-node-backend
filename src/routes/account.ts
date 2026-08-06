import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { upload } from '@core/adapters/storage';
import { getAccount } from '@controllers/account/get-account';
import { postLogin } from '@controllers/account/post-login';
import { postSignup } from '@controllers/account/post-signup';
import { postResetRequest } from '@controllers/account/post-reset-request';
import { postResetConfirm } from '@controllers/account/post-reset-confirm';
import { getRefreshToken } from '@controllers/account/get-refresh-token';
import { postLogoutEverywhere } from '@controllers/account/post-logout-everywhere';
import { deleteExpiredTokens } from '@controllers/account/delete-expired-tokens';
import { deleteAccountRequest } from '@controllers/account/delete-account-request';
import { deleteAccountConfirm } from '@controllers/account/delete-account-confirm';
import { invalidateCache, noStore, setCache } from '@middlewares/cache';

/** Express router for account/auth endpoints (login, signup, password reset, token refresh). */
export const router = Router();

// All routes apply getAuth so request.authContext is populated when a token is present
router.use(getAuth);

// Credentials and auth-state changes: never cacheable. Mounted here rather than per
// controller so a route added later cannot silently omit it — see `noStore`.
router.use(noStore);

// GET /account — current user profile (requires auth)
router.get('/', setCache(3600, { tags: ['account'] }), isAuth, getAccount);

// DELETE /account — request account deletion (requires auth)
router.delete('/', isAuth, deleteAccountRequest);

// DELETE /account/delete-confirm — confirm account deletion with token
router.delete('/delete-confirm', invalidateCache(['users', 'account']), deleteAccountConfirm);

// POST /account/login — authenticate and get tokens
router.post('/login', postLogin);

// POST /account/signup — register new user
router.post(
    '/signup',
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    postSignup
);

// POST /account/reset — request password reset email
router.post('/reset', postResetRequest);

// POST /account/reset-confirm — complete password reset with token
router.post('/reset-confirm', invalidateCache(['users', 'account']), postResetConfirm);

// GET /account/refresh — create a new access token from the jwt cookie
router.get('/refresh', getRefreshToken);

// POST /account/logout-all — revoke all refresh tokens (requires auth)
router.post('/logout-all', isAuth, invalidateCache(['account']), postLogoutEverywhere);

// DELETE /account/tokens/expired — remove expired tokens from the DB (admin only)
router.delete(
    '/tokens/expired',
    isAuth,
    isAdmin,
    invalidateCache(['users', 'account']),
    deleteExpiredTokens
);
