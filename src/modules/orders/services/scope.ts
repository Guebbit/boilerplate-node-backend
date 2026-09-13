/**
 * @module
 * Who may read which order, and what they may do to it. The two questions every other file here
 * asks before it writes: `callerScope` narrows the read, `actorOf` picks the lifecycle column,
 * `withActions` puts the answer on the wire.
 */

import { callerForSubject, isUnrestricted } from '@kernel/permissions';
import type { AuthContext, Order } from '@types';
import type { OrderDocument } from '../model';
import { accessibleFilter } from '@kernel/access/query';
import { orderActionsFor } from '../domain';
import type { OrderActor } from '../domain';

/**
 * Which orders a caller is allowed to read — the authorization boundary for order reads: own
 * orders vs everyone's, and a soft-deleted order visible or not. `visibleScope` makes it BOTH;
 * `ownerScope` alone would leave soft-deleted rows visible to their owner. Returns `undefined`
 * for admins ("no restriction"), so callers must spread it, not treat it as a filter — see
 * `accessibleFilter` for why the scope rides in the read.
 */
export const callerScope = (context?: AuthContext) => accessibleFilter(context, 'Order');

/**
 * Which column of the lifecycle table a caller reads. Two actors reach the HTTP surface;
 * `system` names moves that follow a fact from outside the application, and no request may
 * claim it.
 * @returns the actor whose permissions apply
 */
export const actorOf = (authContext?: AuthContext): OrderActor =>
    authContext && isUnrestricted(callerForSubject(authContext, 'Order')) ? 'admin' : 'customer';

/**
 * The single-order response body: the order as it serializes, plus what this caller may do to
 * it — explicit because the two read branches return different shapes, and `actions` must ride
 * on the wire shape or the schema's transform drops it.
 * @returns the serialized order carrying its `actions`
 */
export const withActions = (order: OrderDocument, authContext?: AuthContext): Order => {
    // `unknown` first, then one assertion: the scoped branch already hands back a normalized plain
    // object typed as a document, so neither shape can be spread without saying so once. The
    // second assertion states what the merge actually produces — the contract's wire shape — which
    // structural typing can't verify past the first `unknown` step.
    const serialized: unknown = typeof order.toJSON === 'function' ? order.toJSON() : order;

    return {
        ...(serialized as Record<string, unknown>),
        actions: orderActionsFor(order.status, actorOf(authContext))
    } as Order;
};
