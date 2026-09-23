/**
 * @module
 * Who may read which order, and what they may do to it. The two questions every other file here
 * asks before it writes: `callerScope` narrows the read, `actorOf` picks the lifecycle column,
 * `withActions` puts the answer on the wire.
 */

import { callerForSubject } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import type { AuthContext, Order } from '@types';
import type { OrderDocument } from '../model';
import { accessibleFilter } from '@kernel/access/query';
import { orderRepository } from '../repository';
import { orderActionsFor } from '../domain';
import type { OrderActor } from '../domain';
import { resolveCurrentImages } from './current';

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
 * One account's orders, by id rather than by `AuthContext`, WITHOUT excluding soft-deleted rows —
 * for a caller that already knows whose orders it wants regardless of a request's role
 * (`account`'s data export).
 *
 * @param userId - whose orders
 */
export const ownerScope = (userId: string): Record<string, unknown> =>
    orderRepository.ownerScope(userId);

/**
 * Which column of the lifecycle table a caller reads. Two actors reach the HTTP surface;
 * `system` names moves that follow a fact from outside the application, and no request may
 * claim it.
 *
 * Gated on `orders.any.update` by name, the same key `cancelById` asks for its own
 * operator/customer split — a broader check would have missed a moderator or manager and
 * silently reduced them to the customer's lifecycle column.
 * @returns the actor whose permissions apply
 */
export const actorOf = (authContext?: AuthContext): OrderActor =>
    authContext && holdsKey(callerForSubject(authContext, 'Order'), 'orders.any.update')
        ? 'admin'
        : 'customer';

/**
 * The single-order response body: the order as it serializes, plus what this caller may do to
 * it — `actions` must ride on the wire shape or the schema's transform drops it. `async` for
 * `resolveCurrentImages`'s `$in` lookup — the one thing here that isn't a synchronous transform.
 * @returns the serialized order carrying its `actions` and each line's live `current` picture
 */
export const withActions = (order: OrderDocument, authContext?: AuthContext): Promise<Order> => {
    // One cast: `.toJSON()`'s return type is the schema's own `Document['toJSON']` overload, not
    // this module's `Order` contract — the same reasoning `products/service.ts`'s `getById` cast
    // uses.
    const serialized = order.toJSON() as Order;

    return resolveCurrentImages([serialized]).then(([resolved]) => ({
        ...resolved,
        actions: orderActionsFor(order.status, actorOf(authContext))
    }));
};
