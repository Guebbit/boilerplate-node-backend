import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { postFeedbackContact } from './controllers/post-feedback-contact';
import { getFeedback, searchFeedbackKeyParameters } from './controllers/get-feedback';
import { putFeedbackStatus } from './controllers/put-feedback-status';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';

/** Express router for feedback/contact endpoints (public contact form; admin read/update). */
export const router = Router();

/*
 * PUBLIC, and it is the only one. The contact form is the whole reason this module exists for a
 * visitor, so it is mounted ABOVE the guard below rather than carrying an exemption.
 */
router.post('/contact', invalidateCache(['feedback']), postFeedbackContact);

/*
 * Everything from here down is the operator's view of what visitors sent, so it is admin-only.
 *
 * POSITIONAL, and that is the hazard worth naming: this guards the routes BELOW it and nothing
 * above. A route appended in the wrong half is public without looking wrong, which is why the one
 * public route sits alone at the top with its own comment rather than anywhere convenient.
 * `tests/cross-cutting/authenticated-controllers.test.ts` catches the case where such a route also
 * reads the caller.
 */
router.use(getAuth, isAuth, isAdmin);

/*
 * The DTO form of `GET /`, and the reason that route declares no body: a GET body has no defined
 * semantics and `setCache` keys only on query parameters, so filters sent that way were invisible
 * to the key. Mounted ABOVE `/:id`-shaped routes for the same reason products does it — there is
 * none here today, but the ordering is what stops one added later from matching "search" as an id.
 *
 * Uncached, like the other three `/search` siblings: the query form is the cacheable one.
 */
router.post('/search', getFeedback);

router.get(
    '/',
    setCache(600, { tags: ['feedback'], keyParameters: searchFeedbackKeyParameters }),
    getFeedback
);
router.put('/:id', invalidateCache(['feedback']), putFeedbackStatus);
