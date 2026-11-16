/**
 * @module
 * GET /returns/:id — one return with the caller's `actions`. A return on someone else's order is a
 * 404, the same as one that does not exist.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import type { Return } from '@types';
import { recordStaffRead } from '@kernel/staff-read';
import { buyerIdOf, orderService } from '@modules/orders';
import { returnService } from '../services';
import { returnsAuditActions } from '../audit';

/** Handles `GET /returns/:id`. */
export const getReturnById = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'returns.not-found' });
    if (!id) return;
    /* Auth context is guaranteed by isAuth middleware */
    const authContext = request.authContext!;

    return returnService
        .getReturn(id, authContext)
        .then((result) => {
            if (refused(response, result)) return;
            /**
             * The return model holds no buyer on purpose; the person the read is about is the
             * order's buyer, resolved here and stored only on the audit row.
             */
            return orderService.getById(result.data.orderId).then((order) => {
                recordStaffRead(request, {
                    key: 'read:Return',
                    action: returnsAuditActions.ADMIN_RETURN_VIEWED,
                    targetType: 'return',
                    targetId: id,
                    subjectId: order ? buyerIdOf(order) : undefined
                });
                successResponse<Return>(response, result.data, 200);
            });
        })
        .catch(catchAs(response, 'getReturnById'));
};
