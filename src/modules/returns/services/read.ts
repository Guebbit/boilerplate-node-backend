/**
 * @module
 * Reading returns. Who sees what: staff holding `returns.any.read` see every return; anyone else
 * sees the returns on THEIR OWN orders — ownership is the order's, because a return is keyed by
 * `orderId` and never by `userId`, so it has no owner of its own to filter on.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { callerForSubject } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { orderService, ownOrderIds } from '@modules/orders';
import type { AuthContext, Return, ReturnActions } from '@types';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { presentReturn } from '../presenter';
import { DECIDABLE_RETURN_STATUSES, RECEIVABLE_RETURN_STATUSES } from '../domain';

/** The filters `GET /returns` accepts. */
export interface ReturnFilters {
    page?: string | number;
    pageSize?: string | number;
    orderId?: string;
    status?: string;
    reason?: string;
}

/** Whether this caller works the returns queue — the wide read. */
const isStaff = (authContext: AuthContext): boolean =>
    holdsKey(callerForSubject(authContext, 'Return'), 'returns.any.read');

/**
 * What this caller may do to this return, decided here so no client re-implements the lifecycle.
 * @param returned - the return
 * @param authContext - the caller
 */
export const actionsFor = (returned: ReturnDocument, authContext: AuthContext): ReturnActions => {
    const caller = callerForSubject(authContext, 'Return');
    const decidable = DECIDABLE_RETURN_STATUSES.includes(returned.status);
    const canDecide = holdsKey(caller, 'returns.any.update') && decidable;
    return {
        approve: canDecide,
        decline: canDecide,
        receive:
            holdsKey(caller, 'returns.any.receive') &&
            RECEIVABLE_RETURN_STATUSES.includes(returned.status)
    };
};

/**
 * A return as the wire carries it, with the caller's `actions`.
 * @param returned - the return
 * @param authContext - the caller
 */
export const withActions = (returned: ReturnDocument, authContext: AuthContext): Return => ({
    ...presentReturn(returned),
    actions: actionsFor(returned, authContext)
});

/**
 * The returns this caller may see, filtered. Staff filter freely; everyone else is held to their
 * own orders — an `orderId` outside them answers an empty page, never someone else's rows.
 *
 * @param filters - page, and an optional order, status and reason
 * @param authContext - the caller
 */
export const listReturns = (
    filters: ReturnFilters,
    authContext: AuthContext
): Promise<{ items: Return[]; meta: PaginatedMeta }> => {
    const { status, reason, ...rest } = filters;
    const exact = { ...(status ? { status } : {}), ...(reason ? { reason } : {}) };
    const search = (scope: Record<string, unknown>) =>
        returnRepository.search(rest, { ...exact, ...scope });

    if (isStaff(authContext)) return search({});

    return ownOrderIds(authContext.id).then((ids) => search({ orderId: { $in: ids } }));
};

/**
 * One return, if this caller may see it: staff always, anyone else only on their own order — a
 * return on someone else's order is a 404, the same as one that does not exist.
 *
 * @param id - the return
 * @param authContext - the caller
 */
export const getReturn = (
    id: string,
    authContext: AuthContext
): Promise<ResponseSuccess<Return> | ResponseReject> =>
    returnRepository.findById(id).then((found) => {
        if (!found) return generateReject(404, [t('returns.not-found')]);
        if (isStaff(authContext)) return generateSuccess(withActions(found, authContext));

        return orderService
            .getById(String(found.orderId), orderService.callerScope(authContext))
            .then((order) =>
                order && String(order.userId) === authContext.id
                    ? generateSuccess(withActions(found, authContext))
                    : generateReject(404, [t('returns.not-found')])
            );
    });
