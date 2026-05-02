import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';

export const router = Router();

router.use(getAuth, isAuth, isAdmin);
// Activity-log and suspicious-alert admin endpoints were removed from this branch
// to avoid overlap with a separate, more advanced parallel implementation.
