/**
 * @module
 * Controller for `POST /users/:id/lift-purchase-hold` — ending the pause staff put on one account.
 *
 * See: docs/modules/users.md#purchase-hold
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { answerAsResource } from '@infrastructure/http/preconditions';
import { requireId } from '@infrastructure/http/ids';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, namedHandler, refused } from '@infrastructure/http/controller';
import { userService } from '../services';

/**
 * POST /users/:id/lift-purchase-hold — end the hold now and restart the cancellation count.
 * `userService.liftPurchaseHold` owns the 404, the 403 for a staff account and the audit row.
 */
export const postLiftPurchaseHold = namedHandler(
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
                        // The user's real tag, and the resource it belongs to (RFC 9110 §8.8.3).
                        answerAsResource(response, user, `/users/${user.id}`);
                        successResponse(response, user, 200);
                    });
            })
            .catch(catchAs(response, 'liftUserPurchaseHold'));
    }
);
