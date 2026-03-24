import express from 'express';
import { isAuth } from "../middlewares/authorizations";

import { pageAccount } from "../controllers/auth/page-account";
import { postLogin } from "../controllers/auth/post-login";
import { postSignup } from "../controllers/auth/post-signup";
import { postResetRequest } from "../controllers/auth/post-reset-request";
import { postResetConfirm } from "../controllers/auth/post-reset-confirm";
import { getLogout } from "../controllers/auth/page-logout";

const router = express.Router();

// GET /account — current user profile (requires JWT)
router.get('/', isAuth, pageAccount);

// POST /account/login — returns JWT
router.post('/login', postLogin);

// POST /account/signup — register new user
router.post('/signup', postSignup);

// POST /account/reset — request password reset email
router.post('/reset', postResetRequest);

// POST /account/reset-confirm — confirm password reset with token
router.post('/reset-confirm', postResetConfirm);

// GET /account/logout — for compatibility; actual logout is client-side (discard JWT)
router.get('/logout', isAuth, getLogout);

export default router;
