/**
 * @module
 * Controller for `POST /users/:id/place-purchase-hold` — staff pausing checkout for one account.
 *
 * See: docs/modules/users.md#purchase-hold
 */

import type { Request, Response } from 'express';
import { PlaceUserPurchaseHoldBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { answerAsResource } from '@infrastructure/http/preconditions';
import { requireId } from '@infrastructure/http/ids';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, namedHandler, parseBody, refused } from '@infrastructure/http/controller';
import { userService } from '../services';

/**
 * POST /users/:id/place-purchase-hold — replace the account's hold with a manual one ending at `until`.
 * `userService.setPurchaseHold` owns the 404, the 403 for a staff account and the audit row.
 */
export const postPlacePurchaseHold = namedHandler(
    'placeUserPurchaseHold',
    (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'users.not-found' });
        if (!id) return Promise.resolve();

        const body = parseBody(PlaceUserPurchaseHoldBody, request.body, response);
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
                        // The user's real tag, and the resource it belongs to (RFC 9110 §8.8.3).
                        answerAsResource(response, user, `/users/${user.id}`);
                        successResponse(response, user, 200);
                    });
            })
            .catch(catchAs(response, 'placeUserPurchaseHold'));
    }
);
