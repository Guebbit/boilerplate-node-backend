import express from 'express';
import { isGuest, isAuth } from "../middlewares/authorizations";

import getLogin from "../controllers/auth/getLogin";
import getSignup from "../controllers/auth/getSignup";
import postLogin from "../controllers/auth/postLogin";
import postSignup from "../controllers/auth/postSignup";
import getLogout from "../controllers/auth/getLogout";
import getReset from "../controllers/auth/getReset";
import postReset from "../controllers/auth/postReset";
import getResetConfirm from "../controllers/auth/getResetConfirm";
import postResetConfirm from "../controllers/auth/postResetConfirm";

const router = express.Router();

router.get('/login', getLogin);

router.get('/signup', getSignup);

router.post('/login', isGuest, postLogin);

router.post('/signup', isGuest, postSignup);

router.get('/logout',isAuth, getLogout);

router.get('/reset', isGuest, getReset);

router.post('/reset', isGuest, postReset);

router.get('/reset/:token', isGuest, getResetConfirm);

router.post('/reset/:token', isGuest, postResetConfirm);

export default router;
