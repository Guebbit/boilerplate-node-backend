import express from 'express';
import { isGuest, isAuth } from "@middlewares/authorizations";
import { csrfSynchronisedProtection } from "@middlewares/csrf";

import { pageAccount } from "@controllers/auth/page-account";
import { pageLogin } from "@controllers/auth/page-login";
import { postLogin } from "@controllers/auth/post-login";
import { pageSignup } from "@controllers/auth/page-signup";
import { postSignup } from "@controllers/auth/post-signup";
import { pageReset } from "@controllers/auth/page-reset";
import { postResetRequest } from "@controllers/auth/post-reset-request";
import { pageResetConfirm } from "@controllers/auth/page-reset-confirm";
import { postResetConfirm } from "@controllers/auth/post-reset-confirm";
import { getLogout } from "@controllers/auth/page-logout";

const router = express.Router();

// GET /account — current user's profile page
router.get('/', isAuth, pageAccount);

router.get('/login', isGuest, pageLogin);

router.post('/login', isGuest, csrfSynchronisedProtection, postLogin);

router.get('/signup', isGuest, pageSignup);

router.post('/signup', isGuest, csrfSynchronisedProtection, postSignup);

router.get('/reset', isGuest, pageReset);

router.post('/reset', isGuest, csrfSynchronisedProtection, postResetRequest);

router.get('/reset/:token', isGuest, pageResetConfirm);

router.post('/reset/:token', isGuest, csrfSynchronisedProtection, postResetConfirm);

router.get('/logout', isAuth, getLogout);

export default router;
