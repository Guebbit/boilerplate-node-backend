/**
 * @module
 * Controllers for `PUT` and `DELETE /users/:id/purchase-hold` — staff pausing checkout for one
 * account, and ending the pause.
 *
 * See: docs/modules/users.md#purchase-hold
 */

import type { Request, Response } from 'express';
import { SetUserPurchaseHoldBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, namedHandler, parseBody, refused } from '@infrastructure/http/controller';
import { userService } from '../services';

/**
 * PUT /users/:id/purchase-hold — replace the account's hold with a manual one ending at `until`.
 * `userService.setPurchaseHold` owns the 404, the 403 for a staff account and the audit row.
 */
export const putPurchaseHold = namedHandler(
    'setUserPurchaseHold',
    (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'users.not-found' });
        if (!id) return Promise.resolve();

        const body = parseBody(SetUserPurchaseHoldBody, request.body, response);
        if (!body) return Promise.resolve();

        return userService
            .setPurchaseHold(
                id,
                { until: new Date(body.until), note: body.note },
                callerContextOf(request)
            )
            .then((result) => {
                if (refused(response, result)) return;

                return userService.toUserContract(result.data, request.caller).then((user) => {
                    successResponse(response, user, 200, result.message);
                });
            })
            .catch(catchAs(response, 'setUserPurchaseHold'));
    }
);

/**
 * DELETE /users/:id/purchase-hold — end the hold now and restart the cancellation count.
 * `userService.liftPurchaseHold` owns the 404, the 403 for a staff account and the audit row.
 */
export const deletePurchaseHold = namedHandler(
    'liftUserPurchaseHold',
    (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'users.not-found' });
        if (!id) return Promise.resolve();

        return userService
            .liftPurchaseHold(id, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;

                return userService.toUserContract(result.data, request.caller).then((user) => {
                    successResponse(response, user, 200, result.message);
                });
            })
            .catch(catchAs(response, 'liftUserPurchaseHold'));
    }
);
