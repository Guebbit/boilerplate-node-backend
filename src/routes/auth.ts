import express from 'express';
import { isGuest, isAuth } from "../middlewares/authorizations";
import { csrfSynchronisedProtection } from "../middlewares/csrf";

import { getLogin } from "../controllers/auth/get-login";
import { postLogin } from "../controllers/auth/post-login";
import { getSignup } from "../controllers/auth/get-signup";
import { postSignup } from "../controllers/auth/post-signup";
import { getReset } from "../controllers/auth/get-reset";
import { postReset } from "../controllers/auth/post-reset";
import { getResetConfirm } from "../controllers/auth/get-reset-confirm";
import { postResetConfirm } from "../controllers/auth/post-reset-confirm";
import { getLogout } from "../controllers/auth/get-logout";

const router = express.Router();

router.get('/login', isGuest, getLogin);

router.post('/login', isGuest, csrfSynchronisedProtection, postLogin);

router.get('/signup', isGuest, getSignup);

router.post('/signup', isGuest, csrfSynchronisedProtection, postSignup);

router.get('/reset', isGuest, getReset);

router.post('/reset', isGuest, csrfSynchronisedProtection, postReset);

router.get('/reset/:token', isGuest, getResetConfirm);

router.post('/reset/:token', isGuest, csrfSynchronisedProtection, postResetConfirm);

router.get('/logout', isAuth, getLogout);

export default router;
