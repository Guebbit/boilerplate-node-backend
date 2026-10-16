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
import { holds } from '@kernel/ability';
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
 * Whether this request is a staff remainder cancel — `kind: cancellation`, any reason but the one
 * exempt value `withdrawal`, by a caller holding the refund key. That is the money-out door, so it
 * needs a fresh session. The buyer's own withdrawal is never prompted.
 *
 * Written as a deny on the one exempt value: a missing reason, an array or a wrong case is
 * prompted (fails closed), then refused by the body schema. Safe on the raw body — only
 * `express.json` parses it, nothing rewrites it before the controller, and `CreateReturnBody` is an
 * exact-enum `strictObject` with no coercion. A staff member naming `withdrawal` on someone else's
 * order is refused by the service (422), so the exemption buys them nothing.
 */
const isStaffCancellation = (request: Request): boolean => {
    const body = request.body as { kind?: unknown; reason?: unknown } | undefined;
    return (
        body?.kind === 'cancellation' &&
        body.reason !== 'withdrawal' &&
        request.authContext !== undefined &&
        holds(callerForSubject(request.authContext, 'Return'), 'create', 'Refund')
    );
};

/** Express router for returns. */
export const router = Router();

// Everything below needs a signed-in user: `getAuth` resolves the session, `isAuth` refuses none.
router.use(getAuth, isAuth);

// GET /returns — staff see all, anyone else their own orders'. `privateNoCache`: a per-caller answer.
router.get('/', privateNoCache, getReturns);

// POST /returns — open a return, or withdraw. The budget comes first: a spent one should not cost a write.
// A staff `cancellation` is a refund: it needs a fresh session, at that key's own tier. The step-up
// sits BEFORE `idempotencyKey`: the ledger records any JSON answer, so a 401 challenge placed behind
// it would be replayed as the answer to the same key after the staff member re-authenticated.
router.post(
    '/',
    returnsWriteLimiter,
    requireFreshAuthWhen(isStaffCancellation, 'critical'),
    idempotencyKey,
    postReturn
);

// GET /returns/options — what the order can still return and cancel. Before `/:id`, which would
// otherwise read "options" as an id.
router.get('/options', privateNoCache, getReturnOptions);

// GET /returns/:id — one return, scoped in the service.
router.get('/:id', privateNoCache, getReturnById);

// POST /returns/:id/approve — staff accept a `requested` return.
router.post('/:id/approve', requirePermission('update', 'Return'), postReturnApprove);

// POST /returns/:id/decline — staff refuse a `requested` return.
router.post('/:id/decline', requirePermission('update', 'Return'), postReturnDecline);

// POST /returns/:id/receive — the goods arrived. `receive:Return` carries `stepUp: critical` in
// `shared/authorization-keys.yaml`: receiving pays the customer back. The `Idempotency-Key` makes a
// retried receipt land once, though the conditional move already guarantees the restock does.
router.post(
    '/:id/receive',
    requirePermission('receive', 'Return'),
    idempotencyKey,
    postReturnReceive
);
