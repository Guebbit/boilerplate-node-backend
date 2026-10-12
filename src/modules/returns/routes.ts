/**
 * @module
 * Route table for returns. Every route is behind the auth wall — a return is somebody's — and each
 * says what it needs: the customer's own doors (open, list, read) need only a session and are
 * scoped to their own orders by the service, the staff doors need the key that names the action.
 *
 * Money:     `POST /returns/:id/receive` pays the customer back, so its key carries a fresh-session
 *            tier (`stepUp: critical`) that `requirePermission` demands and audits.
 *
 * `POST /returns` carries the account-keyed budget and an `Idempotency-Key`: it opens a row staff
 * must read, and a retried request must open it once.
 *
 * See: docs/modules/returns.md
 */

import type { Request } from 'express';
import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requirePermission,
    requireFreshAuthWhen
} from '@kernel/middlewares/authorizations';
import { callerForSubject } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { privateNoCache } from '@infrastructure/http/middlewares/cache';
import { returnsWriteLimiter } from './rate-limits';
import { postReturn } from './controllers/post-return';
import { getReturns } from './controllers/get-returns';
import { getReturnById } from './controllers/get-return-by-id';
import { getReturnOptions } from './controllers/get-return-options';
import { postReturnApprove, postReturnDecline } from './controllers/post-return-decision';
import { postReturnReceive } from './controllers/post-return-receive';

/**
 * Whether this request is a remainder cancel by someone who holds the refund key — the one shape of
 * `POST /returns` that is staff's money-out door and so needs a fresh session. Read from the body, so
 * this guard must come after the body parser (it does: the app mounts it globally).
 */
const isStaffCancellation = (request: Request): boolean =>
    (request.body as { kind?: string } | undefined)?.kind === 'cancellation' &&
    request.authContext !== undefined &&
    holdsKey(callerForSubject(request.authContext, 'Return'), 'payments.any.update');

/** Express router for returns. */
export const router = Router();

// Everything below needs a signed-in user: `getAuth` resolves the session, `isAuth` refuses none.
router.use(getAuth, isAuth);

// GET /returns — staff see all, anyone else their own orders'. `privateNoCache`: a per-caller answer.
router.get('/', privateNoCache, getReturns);

// POST /returns — open a return, or withdraw. The budget comes first: a spent one should not cost a write.
// A `cancellation` by a caller holding the refund key is a staff refund: it needs a fresh session,
// at that key's own tier. The buyer's own withdrawal is never prompted — the guard asks the key, and
// a buyer without it passes through; the service refuses a staff member who is also the buyer.
router.post(
    '/',
    returnsWriteLimiter,
    idempotencyKey,
    requireFreshAuthWhen(isStaffCancellation, 'critical'),
    postReturn
);

// GET /returns/options — what the order can still return and cancel. Before `/:id`, which would
// otherwise read "options" as an id.
router.get('/options', privateNoCache, getReturnOptions);

// GET /returns/:id — one return, scoped in the service.
router.get('/:id', privateNoCache, getReturnById);

// POST /returns/:id/approve — staff accept a `requested` return.
router.post('/:id/approve', requirePermission('returns.any.update'), postReturnApprove);

// POST /returns/:id/decline — staff refuse a `requested` return.
router.post('/:id/decline', requirePermission('returns.any.update'), postReturnDecline);

// POST /returns/:id/receive — the goods arrived. `returns.any.receive` carries `stepUp: critical` in
// `shared/authorization-keys.yaml`: receiving pays the customer back. The `Idempotency-Key` makes a
// retried receipt land once, though the conditional move already guarantees the restock does.
router.post(
    '/:id/receive',
    requirePermission('returns.any.receive'),
    idempotencyKey,
    postReturnReceive
);
