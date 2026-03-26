import express from 'express';
import { getAuth, isAuth, isGuest } from '@middlewares/authorizations';

import { login, signup, refresh, logout, requestPasswordReset, confirmPasswordReset } from '@controllers/api/auth';
import { getAccount } from '@controllers/api/account';

const router = express.Router();

// Populate req.user from JWT token on all auth routes
router.use(getAuth);

// POST /account/login
router.post('/login', isGuest, login);

// POST /account/signup
router.post('/signup', isGuest, signup);

// POST /account/refresh — issue new access token using refresh cookie
router.post('/refresh', refresh);

// GET /account/logout — revoke refresh token and clear cookies
router.get('/logout', isAuth, logout);

// POST /account/reset — request a password reset email
router.post('/reset', requestPasswordReset);

// POST /account/reset-confirm — confirm password reset with token
router.post('/reset-confirm', confirmPasswordReset);

// GET /account — get the currently authenticated user
router.get('/', isAuth, getAccount);

export default router;

