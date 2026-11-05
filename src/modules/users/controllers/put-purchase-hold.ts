/**
 * @module
 * Controller for `PUT /users/:id/purchase-hold` — staff pausing checkout for one account.
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

                return userService
                    .toUserContract(result.data, callerContextOf(request).caller)
                    .then((user) => {
                        successResponse(response, user, 200);
                    });
            })
            .catch(catchAs(response, 'setUserPurchaseHold'));
    }
);
