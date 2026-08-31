/**
 * @module
 * Route table for feedback/contact. One public route — the visitor contact form — mounted above a
 * single `router.use(getAuth, isAuth, isAdmin)` gate; everything below it is the operator's view of
 * what visitors sent. The gate is positional: a route appended in the wrong half is public or
 * admin-only purely by where it was typed.
 *
 * See: docs/modules/feedback.md
 */

import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { postFeedbackContact } from './controllers/post-feedback-contact';
import { getFeedback, searchFeedbackKeyParameters } from './controllers/get-feedback';
import { putFeedbackStatus } from './controllers/put-feedback-status';
import { deleteFeedback } from './controllers/delete-feedback';
import { invalidateCache, searchCache } from '@infrastructure/http/middlewares/cache';
import { submissionLimiter } from '@infrastructure/http/middlewares/rate-limit';

/** Express router for feedback/contact endpoints (public contact form; admin read/update). */
export const router = Router();

/*
 * PUBLIC, and it is the only one. The contact form is the whole reason this module exists for a
 * visitor, so it is mounted ABOVE the guard below rather than carrying an exemption.
 *
 * `submissionLimiter` first, same reasoning as the credential budgets: a spent budget should not
 * cost a database write. It is a DIFFERENT limiter from `credentialLimiters` — this form's abuse
 * is a successful post repeated, not a failed one. See docs/tools/security.md#the-two-rate-limit-budgets.
 */
router.post('/contact', submissionLimiter, invalidateCache(['feedback']), postFeedbackContact);

/*
 * Everything below is admin-only. POSITIONAL — guards routes below it, not above — which is why
 * the one public route sits alone at the top. `tests/cross-cutting/authenticated-controllers.test.ts`
 * catches a misplaced route that also reads the caller.
 */
router.use(getAuth, isAuth, isAdmin);

/**
 * The DTO form of `GET /` — a GET body has no defined semantics and `setCache` keys only on
 * query parameters, so this exists to carry filters. Mounted ABOVE any future `/:id` route so
 * "search" can't later match as an id.
 *
 * Shares its cache key with the GET above (`keyAs: 'feedback:search'`), so either warms the
 * other. Wire response stays `no-store` — this is a Redis-side cache, not a browser-cacheable POST.
 */
const cacheFeedbackSearch = searchCache('feedback', searchFeedbackKeyParameters, 600);

router.post('/search', cacheFeedbackSearch, getFeedback);

router.get('/', cacheFeedbackSearch, getFeedback);
router.put('/:id', invalidateCache(['feedback']), putFeedbackStatus);
router.delete('/:id', invalidateCache(['feedback']), deleteFeedback);
