import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import getAccount from '@controllers/account/get-account';
import postLogin from '@controllers/account/post-login';
import postSignup from '@controllers/account/post-signup';
import postReset from '@controllers/account/post-reset';
import postResetConfirm from '@controllers/account/post-reset-confirm';
import getRefreshToken from '@controllers/get-refresh-token';
import postLogoutEverywhere from '@controllers/post-logout-everywhere';
import deleteExpiredTokens from '@controllers/delete-expired-tokens';

const router = Router();

// All routes apply getAuth so request.user is populated when a token is present
router.use(getAuth);

// GET /account — current user profile (requires auth)
router.get('/', isAuth, getAccount);

// POST /account/login — authenticate and get tokens
router.post('/login', postLogin);

// POST /account/signup — register new user
router.post('/signup', postSignup);

// POST /account/reset — request password reset email
router.post('/reset', postReset);

// POST /account/reset-confirm — complete password reset with token
router.post('/reset-confirm', postResetConfirm);

// GET /account/refresh — create a new access token from the jwt cookie
router.get('/refresh', getRefreshToken);

// GET /account/refresh/:token — create a new access token from the path token
router.get('/refresh/:token', getRefreshToken);

// POST /account/logout-all — revoke all refresh tokens (requires auth)
router.post('/logout-all', isAuth, postLogoutEverywhere);

// DELETE /account/tokens/expired — remove expired tokens from the DB (admin only)
router.delete('/tokens/expired', isAuth, isAdmin, deleteExpiredTokens);

export default router;
