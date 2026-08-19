import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { orderService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { isValidObjectId } from '@infrastructure/http/request';

/**
 * GET /orders/:id
 * Get a single order by path id.
 * Non-admin users can only access their own orders.
 *
 * An id that is not a usable ObjectId is a 404 here, as it is on every other single-item read
 * (`get-product-item.ts`, `get-user-item.ts`): it names no order, which is the same thing a
 * well-formed id matching nothing means.
 *
 * It is checked BEFORE the query rather than caught after it, because the two role branches fail
 * differently. The admin branch is a `findById`, which raises a Mongoose `CastError`; the scoped
 * branch is an aggregate whose `$match` coerces the id itself, which raises a driver `BSONError`
 * — and the response layer reads that one as 422. Answering on the error class therefore made the
 * status depend on WHO asked, for the same malformed value.
 */
export const getOrderItem = (request: Request<{ id?: string }>, response: Response) => {
    if (!isValidObjectId(request.params.id)) {
        rejectResponse(response, 404, [t('orders.not-found')]);
        return;
    }

    /**
     * User role filters:
     * Only admin can see all orders. Regular users can only see their own.
     */
    return orderService
        .getById(request.params.id, orderService.callerScope(request.authContext))
        .then((order) => {
            if (!order) {
                rejectResponse(response, 404, [t('orders.not-found')]);
                return;
            }
            successResponse(response, order);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getOrderItem', error);
        });
};
