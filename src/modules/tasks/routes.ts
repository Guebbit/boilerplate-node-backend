/**
 * @module
 * Route table for tasks. One public route — the visitor contact form — mounted above a
 * single `router.use(getAuth, isAuthOrCredential)` gate; everything below it is the operator's
 * view of what visitors sent, each mount stating the one key its own action needs. The gate is
 * positional: a route appended in the wrong half is public or admin-only purely by where it was
 * typed.
 *
 * @see docs/modules/tasks.md#the-story
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { postTask } from './controllers/post-task';
import { getTasks } from './controllers/get-tasks';
import { getTaskById } from './controllers/get-task';
import { getTaskSummary } from './controllers/get-task-summary';
import { postTaskMarkSpam, postTaskReopen, postTaskResolve } from './controllers/post-task-doors';
import { postTaskAssign } from './controllers/post-task-assign';
import { postTaskUnassign } from './controllers/post-task-unassign';
import { postTaskNote } from './controllers/post-task-note';
import { deleteTask } from './controllers/delete-task';
import { noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { contactLimiters } from './rate-limits';
import { humanChallengeGate } from '@infrastructure/http/middlewares/human-challenge';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';

/** Express router for tasks endpoints (public contact form; admin read/update). */
export const router = Router();

/**
 * PUBLIC, and it is the only one. The contact form is the whole reason this module exists for a
 * visitor, so it is mounted ABOVE the guard below rather than carrying an exemption.
 *
 * `contactLimiters` first, same reasoning as the credential budgets: a spent budget should not
 * cost a database write. Three dimensions — address, submitted email, address block — none of
 * them skipping success: this form's abuse is a successful post repeated, not a failed one.
 * See docs/understand/security.md#the-rate-limit-budgets.
 *
 * `getAuth` next, so a stale sign-in is refused (401) before an antibot token — single-use — is
 * spent on a request that then fails.
 *
 * `humanChallengeGate` after — rung 3, off by default (`NODE_ANTIBOT_PROVIDER`) — before the write
 * it would otherwise refuse just as cheaply after.
 */
router.post('/', contactLimiters, getAuth, humanChallengeGate, idempotencyKey, postTask);

/**
 * Everything below is admin-only. POSITIONAL — guards routes below it, not above — which is why
 * the one public route sits alone at the top. `tests/cross-cutting/authenticated-controllers.test.ts`
 * catches a misplaced route that also reads the caller.
 *
 * `isAuthOrCredential`: everything below is the operator's view, gated by the `Task` rules
 * and reading no `authContext`. The public submission route above is unaffected.
 */
router.use(getAuth, isAuthOrCredential);

/**
 * The DTO form of `GET /` — a GET body has no defined semantics, so this exists to carry filters.
 * Mounted ABOVE any `/:id` route so "search" can't later match as an id.
 *
 * Never Redis-cached: a staff queue, which a shared cache must never hold — RFC 9111 §3.5.
 * `noStore`, like every POST answer.
 */
router.post('/search', requirePermission('read', 'Task'), noStore, getTasks);

// `privateNoCache`: the browser may keep its own copy, revalidated every time.
router.get('/', requirePermission('read', 'Task'), privateNoCache, getTasks);

// GET /tasks/summary — the badge's counts. Above `/:id`, so "summary" is not read as an id.
router.get('/summary', requirePermission('read', 'Task'), noStore, getTaskSummary);

// GET /tasks/:id — one task. After `/`, `/search` and `/summary`, so none matches as an id.
router.get('/:id', requirePermission('read', 'Task'), privateNoCache, getTaskById);

/**
 * The status doors: one action per effect, no body (`docs/understand/write-methods.md`). The status field
 * is read-only, so there is no PATCH.
 */
router.post('/:id/resolve', requirePermission('update', 'Task'), noStore, postTaskResolve);
router.post('/:id/mark-spam', requirePermission('update', 'Task'), noStore, postTaskMarkSpam);
router.post('/:id/reopen', requirePermission('update', 'Task'), noStore, postTaskReopen);

/**
 * Assignment: a pair of actions, each with its own bell and audit row. Taking a task is assigning
 * yourself; a repeat finds the state reached and answers 409 (`docs/understand/write-methods.md`).
 */
router.post('/:id/assign', requirePermission('update', 'Task'), noStore, postTaskAssign);
router.post('/:id/unassign', requirePermission('update', 'Task'), noStore, postTaskUnassign);

/**
 * POST /tasks/:id/notes — the staff thread, append-only. `idempotencyKey` after the permission
 * check: a note has no delete door, so a retry after a lost answer must replay, not append twice.
 */
router.post(
    '/:id/notes',
    requirePermission('update', 'Task'),
    idempotencyKey,
    noStore,
    postTaskNote
);

// DELETE /tasks/:id — remove the entry
router.delete('/:id', requirePermission('delete', 'Task'), deleteTask);
