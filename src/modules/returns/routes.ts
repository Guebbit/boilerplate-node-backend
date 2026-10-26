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
import { postReturnClose } from './controllers/post-return-close';
import { postReturnCancel } from './controllers/post-return-cancel';

/**
 * Whether this request needs a fresh session. Two things do:
 *
 * - a staff remainder cancel — `kind: cancellation`, any reason but `withdrawal`, by a caller
 *   holding the refund key: the money-out door;
 * - any request carrying `statedVia`: a staff member recording a withdrawal the buyer stated
 *   outside the shop. That is a legal record, and before dispatch it cancels the order and refunds
 *   it, so the check does not look at who is asking — it fails closed. The buyer never sends the
 *   field (the service refuses it with a 422), so a buyer is only prompted for sending what they
 *   must not.
 *
 * The buyer's own withdrawal is never prompted. Written as a deny on the one exempt reason: a
 * missing reason, an array or a wrong case is prompted (fails closed), then refused by the body
 * schema. Safe on the raw body — only `express.json` parses it, nothing rewrites it before the
 * controller, and `CreateReturnBody` is an exact-enum `strictObject` with no coercion.
 */
const needsFreshLogin = (request: Request): boolean => {
    const body = request.body as
        | { kind?: unknown; reason?: unknown; statedVia?: unknown }
        | undefined;
    if (body?.statedVia !== undefined) return true;

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
// A staff `cancellation` is a refund, and a recorded withdrawal (`statedVia`) a legal act: both need a fresh session, at the critical tier. The step-up
// sits BEFORE `idempotencyKey`: the ledger records any JSON answer, so a 401 challenge placed behind
// it would be replayed as the answer to the same key after the staff member re-authenticated.
router.post(
    '/',
    returnsWriteLimiter,
    requireFreshAuthWhen(needsFreshLogin, 'critical'),
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

// POST /returns/:id/close — staff finishing a received return whose money will not follow the usual
// way. The same `receive:Return` key (and so the same `stepUp`) as receiving: closing is the end
// of the same act. No `Idempotency-Key`: a second close finds the return closed and answers 409.
router.post('/:id/close', requirePermission('receive', 'Return'), postReturnClose);

// POST /returns/:id/cancel — staff ending an approved return whose goods never came. `update:Return`,
// the decision key: nothing moves (no money, no stock), so no step-up. No `Idempotency-Key`: a
// second cancel finds the return canceled and answers 409.
router.post('/:id/cancel', requirePermission('update', 'Return'), postReturnCancel);
