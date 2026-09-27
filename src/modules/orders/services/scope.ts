/**
 * @module
 * Who may read which order, and what they may do to it. The two questions every other file here
 * asks before it writes: `callerScope` narrows the read, `actorOf` picks the lifecycle column,
 * `withActions` puts the answer on the wire.
 */

import { callerForSubject, isSystemActor } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import type { AuthContext, Order, OrderActions } from '@types';
import type { OrderDocument } from '../model';
import { accessibleFilter } from '@kernel/access/query';
import { orderRepository } from '../repository';
import { OrderStatus } from '@types';
import {
    orderActionsFor,
    statusesLeadingTo,
    overridableTargetsFrom,
    isDigitalOnlyOrder
} from '../domain';
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
 * Which column of the lifecycle table a caller reads. Three actors reach this function, only two
 * of them over HTTP; `system` names moves that follow a fact from outside the application — the
 * reservation-sweep expiry is the one caller that passes `SYSTEM_ACTOR` here instead of a request's
 * own `AuthContext`, and no request may claim the same column by holding the admin role alone.
 *
 * `SYSTEM_ACTOR` carries `roles.tenant: 'admin'` for every ORDINARY permission check, so this must
 * ask the identity question FIRST — an `authContext && holdsKey(...)` check alone would read it as
 * a plain admin and hand the sweep's expiry the admin column's wider `cancelled` rule, exactly the
 * race B21 closes (see `../domain/lifecycle.ts`'s own comment on `pending.cancelled`).
 *
 * Otherwise gated on `orders.any.update` by name, the same key `cancelById` asks for its own
 * operator/customer split — a broader check would have missed a moderator or manager and
 * silently reduced them to the customer's lifecycle column.
 * @returns the actor whose permissions apply
 */
export const actorOf = (authContext?: AuthContext): OrderActor => {
    if (isSystemActor(authContext)) return 'system';
    return authContext && holdsKey(callerForSubject(authContext, 'Order'), 'orders.any.update')
        ? 'admin'
        : 'customer';
};

/**
 * `delivery`'s four action doors, plus `orders`' own override — none of them decided by
 * `actorOf`'s customer/admin split, since a warehouse operator holds `delivery.any.start` without
 * `orders.any.update` and would otherwise read as a plain customer. Each is asked of the caller's
 * OWN key, at the same tenant scope `actorOf` already resolves — `delivery.any.start`/`.update`
 * and `orders.any.override` are all tenant-scoped keys, so one `callerForSubject(...,'Order')`
 * caller answers all four regardless of which subject each key is declared under.
 *
 * `ship`/`fulfill` are mutually exclusive by construction: `digitalOnly` picks which of the two
 * doors this order could ever go through, `reachesVia(shipped)` picks whether it may go through
 * either RIGHT NOW.
 * @param status - the order's current status
 * @param digitalOnly - whether every line on this order is digital — see `isDigitalOnlyOrder`
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const deliveryAndOverrideActions = (
    status: OrderStatus,
    digitalOnly: boolean,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'start' | 'ship' | 'deliver' | 'fulfill' | 'override'> => {
    if (!authContext)
        return { start: false, ship: false, deliver: false, fulfill: false, override: [] };

    const caller = callerForSubject(authContext, 'Order');
    // `statusesLeadingTo`, not a raw `canTransition(status, target, 'system')`: the latter
    // answers `true` for an ECHO write (status already equals target, legal for every status but
    // `paid`), which would read e.g. `start` as true for an order already `processing`.
    // `statusesLeadingTo` excludes `from === to` by construction.
    const reachesVia = (target: OrderStatus): boolean =>
        statusesLeadingTo(target, 'system').includes(status);
    const canRecordFulfilment = holdsKey(caller, 'delivery.any.update');
    return {
        start: holdsKey(caller, 'delivery.any.start') && reachesVia(OrderStatus.processing),
        ship: canRecordFulfilment && !digitalOnly && reachesVia(OrderStatus.shipped),
        deliver: canRecordFulfilment && reachesVia(OrderStatus.delivered),
        // `processing → delivered` for a digital-only order — no lifecycle-table entry to ask
        // `reachesVia` about, since `delivery/service.ts`'s `fulfillOrder` gates this move
        // directly rather than through `ORDER_LIFECYCLE` (see `services/status.ts#markFulfilled`).
        fulfill: canRecordFulfilment && digitalOnly && status === OrderStatus.processing,
        override: holdsKey(caller, 'orders.any.override') ? [...overridableTargetsFrom(status)] : []
    };
};

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
        actions: {
            ...orderActionsFor(order.status, actorOf(authContext)),
            ...deliveryAndOverrideActions(
                order.status,
                isDigitalOnlyOrder(order.items),
                authContext
            ),
            // `paidAt` is stamped in the SAME write that moves an order to `paid`
            // (`repository.ts#markPaid`), so it is a same-module, no-dependency proxy for "an
            // invoice was issued" — `invoicing` freezes one from the very same transition, in its
            // own event listener. `GET /orders/{id}/invoice` (owned by `invoicing`) still checks
            // for real and 404s on the rare gap this flag cannot see — the same "gaps are
            // acceptable" policy `orderNumber` already lives under.
            invoice: Boolean(order.paidAt)
        }
    }));
};
