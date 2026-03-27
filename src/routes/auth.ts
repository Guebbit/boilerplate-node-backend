import { Router } from 'express';
import { getAuth, isAuth } from '@middlewares/authorizations';
import {
    getAccount,
    login,
    signup,
    requestPasswordReset,
    confirmPasswordReset,
} from '@controllers/account';

const router = Router();

// All routes apply getAuth so request.user is populated when a token is present
router.use(getAuth);

// GET /account — current user profile (requires auth)
router.get('/', isAuth, getAccount);

// POST /account/login — authenticate and get tokens
router.post('/login', login);

// POST /account/signup — register new user
router.post('/signup', signup);

// POST /account/reset — request password reset email
router.post('/reset', requestPasswordReset);

// POST /account/reset-confirm — complete password reset with token
router.post('/reset-confirm', confirmPasswordReset);

export default router;
