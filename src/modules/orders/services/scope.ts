/**
 * @module
 * Who may read which order, and which lifecycle column a caller reads. The two questions every
 * other file here asks before it writes: `callerScope` narrows the read, `actorOf` picks the
 * column. What the caller may do to one order is `./actions`.
 */

import { callerForSubject, isSystemActor } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import type { AuthContext } from '@types';
import { accessibleFilter } from '@kernel/access/query';
import { orderRepository } from '../repository';
import type { OrderActor } from '../domain';

/**
 * Which orders a caller is allowed to read — the authorization boundary for order reads: own
 * orders vs everyone's, and a soft-deleted order visible or not, compiled from the caller's RULES
 * rather than assembled by hand — see `@kernel/access/query`'s `accessibleFilter` for why that is
 * the one encoding of "own AND still there" this module trusts. `{}` for a role that reads
 * everything ("no restriction"), never `undefined` — both spread into a query the same way, and
 * `{}` is what "these are the conditions, and there are none" honestly looks like.
 */
export const callerScope = (context?: AuthContext) => accessibleFilter(context, 'Order');

/**
 * Which orders a caller may CANCEL — the write's own scope, never the read one. A warehouse
 * operator or a support agent can READ every order (`display:Order`) without being allowed to
 * cancel any: asking `callerScope` here would have scoped a write by a read key.
 *
 * - an operator (`update:Order`): the update scope, every live order that key reaches;
 * - anyone else, or a withdrawal (the consumer's own right, never an operator's): the caller's own
 *   live orders, and nothing at all for a caller with no id.
 *
 * @param authContext - the caller; `SYSTEM_ACTOR` for a sweep
 * @param ownOnly - `true` for a withdrawal, which only the buyer may exercise
 */
export const cancelScope = (
    authContext: AuthContext | undefined,
    ownOnly = false
): Record<string, unknown> =>
    actorOf(authContext) === 'customer' || ownOnly
        ? authContext
            ? ownLiveScope(authContext.id)
            : accessibleFilter(undefined, 'Order', 'update')
        : accessibleFilter(authContext, 'Order', 'update');

/**
 * One account's orders, by id rather than by `AuthContext`, WITHOUT excluding soft-deleted rows —
 * for a caller that already knows whose orders it wants regardless of a request's role
 * (`account`'s data export).
 *
 * @param userId - whose orders
 */
export const ownerScope = (userId: string): Record<string, unknown> =>
    orderRepository.ownerScope(userId);

/**
 * One account's orders that still exist: {@link ownerScope} without the soft-deleted rows. The one
 * spelling of "this buyer's own live orders", so a sibling module never has to know `orders` marks
 * a deletion with `deletedAt`.
 *
 * @param userId - whose orders
 */
export const ownLiveScope = (userId: string): Record<string, unknown> => ({
    ...ownerScope(userId),
    deletedAt: null
});

/**
 * Which column of the lifecycle table a caller reads. Three actors reach this function, only two
 * of them over HTTP; `system` names moves that follow a fact from outside the application — the
 * reservation-sweep expiry is the one caller that passes `SYSTEM_ACTOR` here instead of a request's
 * own `AuthContext`, and no request may claim the same column by holding the admin role alone.
 *
 * `SYSTEM_ACTOR` carries `roles.tenant: 'admin'` for every ORDINARY permission check, so this must
 * ask the identity question FIRST — an `authContext && holds(...)` check alone would read it as
 * a plain admin and hand the sweep's expiry the admin column's wider `cancelled` rule, exactly the
 * race this rule closes (see `../domain/lifecycle.ts`'s own comment on `pending.cancelled`).
 *
 * Otherwise gated on `update:Order` by name, the same key `cancelOnRequestById` asks for its own
 * operator/customer split — a broader check would have missed a moderator or manager and
 * silently reduced them to the customer's lifecycle column.
 * @returns the actor whose permissions apply
 */
export const actorOf = (authContext?: AuthContext): OrderActor => {
    if (isSystemActor(authContext)) return 'system';
    return authContext && holds(callerForSubject(authContext, 'Order'), 'update', 'Order')
        ? 'admin'
        : 'customer';
};
