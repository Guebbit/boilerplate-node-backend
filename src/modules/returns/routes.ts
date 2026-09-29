/**
 * @module
 * Route table for returns. Every route is behind the auth wall — a return is somebody's — and each
 * says what it needs: the customer's own doors (open, list, read) need only a session and are
 * scoped to their own orders by the service, the staff doors need the key that names the action.
 *
 * `POST /returns` carries the account-keyed budget and an `Idempotency-Key`: it opens a row staff
 * must read, and a retried request must open it once.
 *
 * See: docs/modules/returns.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { privateNoCache } from '@infrastructure/http/middlewares/cache';
import { returnsWriteLimiter } from './rate-limits';
import { postReturn } from './controllers/post-return';
import { getReturns } from './controllers/get-returns';
import { getReturnById } from './controllers/get-return-by-id';
import { postReturnApprove, postReturnDecline } from './controllers/post-return-decision';

/** Express router for returns. */
export const router = Router();

router.use(getAuth, isAuth);

// GET /returns — staff see all, anyone else their own orders'. `privateNoCache`: a per-caller answer.
router.get('/', privateNoCache, getReturns);

// POST /returns — open a return, or withdraw. The budget comes first: a spent one should not cost a write.
router.post('/', returnsWriteLimiter, idempotencyKey, postReturn);

// GET /returns/:id — one return, scoped in the service.
router.get('/:id', privateNoCache, getReturnById);

// POST /returns/:id/approve and /decline — staff decide a `requested` return.
router.post('/:id/approve', requirePermission('returns.any.update'), postReturnApprove);
router.post('/:id/decline', requirePermission('returns.any.update'), postReturnDecline);
