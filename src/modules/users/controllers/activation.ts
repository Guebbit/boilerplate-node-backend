/**
 * @module
 * Controllers for `POST /users/:id/activate` and `POST /users/:id/deactivate` — staff switching
 * an account on or off. `userService` owns the 404, the 403 for a staff account, the 409 for a
 * repeat and the audit row.
 *
 * See: docs/modules/users.md#activating-and-deactivating
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, namedHandler, refused } from '@infrastructure/http/controller';
import { userService } from '../services';

/**
 * One handler for both switches: load the id, run the service move, answer with the user.
 *
 * @param name - the operationId, for the named handler and the error log
 * @param move - the service call
 */
const switchHandler = (name: string, move: typeof userService.activate) =>
    namedHandler(name, (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'users.not-found' });
        if (!id) return Promise.resolve();

        const context = callerContextOf(request);
        return move(id, context)
            .then((result) => {
                if (refused(response, result)) return;

                return userService.toUserContract(result.data, context.caller).then((user) => {
                    successResponse(response, user, 200, result.message);
                });
            })
            .catch(catchAs(response, name));
    });

/** POST /users/:id/activate — let a deactivated account sign in again. */
export const postActivate = switchHandler('activateUserById', (id, context) =>
    userService.activate(id, context)
);

/** POST /users/:id/deactivate — lock the account out and end its sessions. */
export const postDeactivate = switchHandler('deactivateUserById', (id, context) =>
    userService.deactivate(id, context)
);
