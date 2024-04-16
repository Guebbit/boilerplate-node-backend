import express from 'express';
import { isGuest, isAuth } from "../middlewares/authorizations";

import getLogin from "../controllers/auth/get-login";
import getSignup from "../controllers/auth/get-signup";
import postLogin from "../controllers/auth/post-login";
import postSignup from "../controllers/auth/post-signup";
import getLogout from "../controllers/auth/get-logout";
import getReset from "../controllers/auth/get-reset";
import postReset from "../controllers/auth/post-reset";
import getResetConfirm from "../controllers/auth/get-reset-confirm";
import postResetConfirm from "../controllers/auth/post-reset-confirm";

const router = express.Router();

router.get('/login', getLogin);

router.get('/signup', getSignup);

router.post('/login', isGuest, postLogin);

router.post('/signup', isGuest, postSignup);

router.get('/logout', isAuth, getLogout);

router.get('/reset', isGuest, getReset);

router.post('/reset', isGuest, postReset);

router.get('/reset/:token', isGuest, getResetConfirm);

router.post('/reset/:token', isGuest, postResetConfirm);

export default router;
