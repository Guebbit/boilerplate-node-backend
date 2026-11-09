/**
 * @module
 * Controllers for `POST /users/:id/assign-role` and `POST /users/:id/revoke-role` — the role door.
 * `userService` owns the 404, the 403, the 422 for a name nobody can be given, the 409 for a repeat
 * and the audit row.
 *
 * See: docs/modules/users.md#the-role-door
 */

import type { Request, Response } from 'express';
import { AssignUserRoleBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, namedHandler, parseBody, refused } from '@infrastructure/http/controller';
import { userService } from '../services';

/**
 * Answer a door's result: the refusal as it is, or the user with the flags this caller sees.
 *
 * @param name - the operationId, for the error log
 * @param request - the request the door answers
 * @param response - the response to write
 * @param done - the service call's promise
 */
const answer = (
    name: string,
    request: Request,
    response: Response,
    done: ReturnType<typeof userService.revokeUserRole>
): Promise<void> =>
    done
        .then((result) => {
            if (refused(response, result)) return;

            return userService
                .toUserContract(result.data, callerContextOf(request).caller)
                .then((user) => {
                    successResponse(response, user, 200);
                });
        })
        .catch(catchAs(response, name));

/** POST /users/:id/assign-role — give the account the role named, replacing the one it holds. */
export const postAssignRole = namedHandler(
    'assignUserRole',
    (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'users.not-found' });
        if (!id) return Promise.resolve();

        const body = parseBody(AssignUserRoleBody, request.body, response);
        if (!body) return Promise.resolve();

        return answer(
            'assignUserRole',
            request,
            response,
            userService.assignUserRole(id, body.role, callerContextOf(request))
        );
    }
);

/** POST /users/:id/revoke-role — take the account's staff role away. */
export const postRevokeRole = namedHandler(
    'revokeUserRole',
    (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'users.not-found' });
        if (!id) return Promise.resolve();

        return answer(
            'revokeUserRole',
            request,
            response,
            userService.revokeUserRole(id, callerContextOf(request))
        );
    }
);
