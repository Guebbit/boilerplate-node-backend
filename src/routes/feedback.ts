import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { postFeedbackContact } from '@controllers/feedback/post-feedback-contact';
import { getFeedback } from '@controllers/feedback/get-feedback';
import { putFeedbackStatus } from '@controllers/feedback/put-feedback-status';
import { invalidateCache, setCache } from '@utils/helpers-response';
import { auditAdminActivity } from '@middlewares/audit-admin-activity';

export const router = Router();

router.post('/contact', invalidateCache(['feedback']), postFeedbackContact);

router.use(getAuth, isAuth, isAdmin, auditAdminActivity);

router.get('/', setCache(600, { tags: ['feedback'] }), getFeedback);
router.put('/:id', invalidateCache(['feedback']), putFeedbackStatus);
