import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { postFeedbackContact } from './controllers/post-feedback-contact';
import { getFeedback, searchFeedbackKeyParameters } from './controllers/get-feedback';
import { putFeedbackStatus } from './controllers/put-feedback-status';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';

/** Express router for feedback/contact endpoints (public contact form; admin read/update). */
export const router = Router();

router.post('/contact', invalidateCache(['feedback']), postFeedbackContact);

router.use(getAuth, isAuth, isAdmin);

router.get(
    '/',
    setCache(600, { tags: ['feedback'], keyParameters: searchFeedbackKeyParameters }),
    getFeedback
);
router.put('/:id', invalidateCache(['feedback']), putFeedbackStatus);
