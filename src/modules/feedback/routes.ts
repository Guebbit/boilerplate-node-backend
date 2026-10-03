/**
 * @module
 * Route table for feedback/contact. One public route — the visitor contact form — mounted above a
 * single `router.use(getAuth, isAuthOrCredential)` gate; everything below it is the operator's
 * view of what visitors sent, each mount stating the one key its own action needs. The gate is
 * positional: a route appended in the wrong half is public or admin-only purely by where it was
 * typed.
 *
 * See: docs/modules/feedback.md
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { postFeedbackContact } from './controllers/post-feedback-contact';
import { getFeedback } from './controllers/get-feedback';
import { replaceFeedbackStatus, updateFeedbackStatus } from './controllers/update-feedback-status';
import { deleteFeedback } from './controllers/delete-feedback';
import { noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { contactLimiters } from './rate-limits';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';

/** Express router for feedback/contact endpoints (public contact form; admin read/update). */
export const router = Router();

/*
 * PUBLIC, and it is the only one. The contact form is the whole reason this module exists for a
 * visitor, so it is mounted ABOVE the guard below rather than carrying an exemption.
 *
 * `contactLimiters` first, same reasoning as the credential budgets: a spent budget should not
 * cost a database write. Three dimensions — address, submitted email, address block — none of
 * them skipping success: this form's abuse is a successful post repeated, not a failed one.
 * See docs/tools/security.md#the-rate-limit-budgets.
 *
 * `humanChallengeGate` next — rung 3, off by default (`NODE_ANTIBOT_PROVIDER`) — before the write it
 * would otherwise refuse just as cheaply after.
 */
router.post('/contact', contactLimiters, humanChallengeGate, idempotencyKey, postFeedbackContact);

/*
 * Everything below is admin-only. POSITIONAL — guards routes below it, not above — which is why
 * the one public route sits alone at the top. `tests/cross-cutting/authenticated-controllers.test.ts`
 * catches a misplaced route that also reads the caller.
 *
 * `isAuthOrCredential`: everything below is the operator's view, gated by `feedback.any.*` keys
 * and reading no `authContext`. The public submission route above is unaffected.
 */
router.use(getAuth, isAuthOrCredential);

/**
 * The DTO form of `GET /` — a GET body has no defined semantics, so this exists to carry filters.
 * Mounted ABOVE any future `/:id` route so "search" can't later match as an id.
 *
 * Never Redis-cached: an admin-only queue, which a shared cache must never hold — RFC 9111 §3.5.
 * `noStore`, like every POST answer.
 */
router.post('/search', requirePermission('feedback.any.read'), noStore, getFeedback);

// `privateNoCache`: the browser may keep its own copy, revalidated every time.
router.get('/', requirePermission('feedback.any.read'), privateNoCache, getFeedback);

// PUT /feedback/:id — replace the entry's status
router.put('/:id', requirePermission('feedback.any.update'), replaceFeedbackStatus);

// PATCH /feedback/:id — merge the fields sent
router.patch('/:id', requirePermission('feedback.any.update'), updateFeedbackStatus);

// DELETE /feedback/:id — remove the entry
router.delete('/:id', requirePermission('feedback.any.delete'), deleteFeedback);
