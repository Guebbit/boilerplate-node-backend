/**
 * @module
 * Controller for `DELETE /users/:id/purchase-hold` — ending the pause staff put on one account.
 *
 * See: docs/modules/users.md#purchase-hold
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, namedHandler, refused } from '@infrastructure/http/controller';
import { userService } from '../services';

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

                return userService
                    .toUserContract(result.data, callerContextOf(request).caller)
                    .then((user) => {
                        successResponse(response, user, 200);
                    });
            })
            .catch(catchAs(response, 'liftUserPurchaseHold'));
    }
);
