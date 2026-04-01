import express from 'express';
import { isGuest, isAuth } from '@middlewares/authorizations';
import { csrfSynchronisedProtection } from '@middlewares/csrf';
import { multerMiddleware } from '@utils/multer';

import { pageAccount } from '@controllers/account/page-account';
import { pageLogin } from '@controllers/account/page-login';
import { postLogin } from '@controllers/account/post-login';
import { pageSignup } from '@controllers/account/page-signup';
import { postSignup } from '@controllers/account/post-signup';
import { pageReset } from '@controllers/account/page-reset';
import { postResetRequest } from '@controllers/account/post-reset-request';
import { pageResetConfirm } from '@controllers/account/page-reset-confirm';
import { postResetConfirm } from '@controllers/account/post-reset-confirm';
import { getLogout } from '@controllers/account/page-logout';

const router = express.Router();

router.get('/', isAuth, pageAccount);

router.get('/login', isGuest, pageLogin);

router.post('/login', isGuest, csrfSynchronisedProtection, postLogin);

router.get('/signup', isGuest, pageSignup);

router.post(
    '/signup',
    isGuest,
    multerMiddleware.single('imageUpload'),
    csrfSynchronisedProtection,
    postSignup
);

router.get('/reset', isGuest, pageReset);

router.post('/reset', isGuest, csrfSynchronisedProtection, postResetRequest);

router.get('/reset/:token', isGuest, pageResetConfirm);

router.post('/reset/:token', isGuest, csrfSynchronisedProtection, postResetConfirm);

router.get('/logout', isAuth, getLogout);

export { router as authRoutes };
