import express from 'express';
import { isGuest, isAuth } from "../middlewares/authorizations";
import { csrfSynchronisedProtection } from "../middlewares/csrf";

import { pageLogin } from "../controllers/auth/page-login";
import { pageSignup } from "../controllers/auth/page-signup";
import { postLogin } from "../controllers/auth/post-login";
import { postSignup } from "../controllers/auth/post-signup";
import { pageLogout } from "../controllers/auth/page-logout";
import { pageReset } from "../controllers/auth/page-reset";
import { postResetRequest } from "../controllers/auth/post-reset-request";
import { pageResetConfirm } from "../controllers/auth/page-reset-confirm";
import { postResetConfirm } from "../controllers/auth/post-reset-confirm";

const router = express.Router();

router.get('/login', isGuest, pageLogin);

router.post('/login', isGuest, csrfSynchronisedProtection, postLogin);

router.get('/signup', isGuest, pageSignup);

router.post('/signup', isGuest, csrfSynchronisedProtection, postSignup);

router.get('/reset', isGuest, pageReset);

router.post('/reset', isGuest, csrfSynchronisedProtection, postResetRequest);

router.get('/reset/:token', isGuest, pageResetConfirm);

router.post('/reset/:token', isGuest, csrfSynchronisedProtection, postResetConfirm);

router.get('/logout', isAuth, pageLogout);

export default router;
