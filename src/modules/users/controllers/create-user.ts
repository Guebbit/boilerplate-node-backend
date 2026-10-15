/**
 * @module
 * Controller for `POST /users` — staff create. The update half lives in `update-user.ts`.
 *
 * See: docs/modules/users.md
 */

import type { Request, Response } from 'express';
import { userService } from '../services';
import { rejectResponse, createdResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { parseBody } from '@infrastructure/http/controller';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { writeWithUploadedImage } from '@infrastructure/http/uploads';
import { CreateUserBody } from '@api/schemas.zod';
import type { CreateUserRequest, CreateUserRequestMultipart, User } from '@types';

/**
 * POST /users — staff create.
 */
export const createUser = (
    request: Request<
        Record<string, string>,
        unknown,
        | CreateUserRequest
        | CreateUserRequestMultipart
        // Express 5 leaves `request.body` UNDEFINED when no parser matched the content-type, and
        // multer does not fill it in on a non-multipart body either.
        | undefined
    >,
    response: Response
) => {
    /*
     * The contract's own strict schema, and from here on ONLY its output: an undeclared key is a
     * 422, never a column. `create` writes whatever it is handed, so a raw body here let an
     * operator set `verifiedAt`, `analyticsConsent` or an unencrypted `phone` straight onto the
     * document. `readInput` decodes the booleans a multipart body carries as strings — see
     * docs/theory/request-input.md.
     */
    const body = parseBody(
        CreateUserBody,
        readInput(request, { surface: 'create', booleans: ['active'] }),
        response
    );
    // `parseBody` has already answered 422: the close hook deletes the upload.
    if (!body) return;
    const { role, active } = body;

    // The upload's image fields are server-decided, so they join only after the body was validated
    // (as `null`-only for `imageUrl`); the helper claims the upload when the write succeeds.
    return writeWithUploadedImage(request, undefined, (image) =>
        userService.create({ ...body, role, active, ...image }, callerContextOf(request))
    )
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            // `toUserContract` picks only the `User` contract's own fields, so the hashed
            // password and tokens on the document never reach `res.json`. The role is read
            // fresh from the membership just written — never off the document, which holds none.
            return userService.toUserContract(result.data, request.caller).then((contract) => {
                createdResponse<User>(response, contract, `/users/${contract.id}`);
            });
        })
        .catch((error: unknown) => {
            rejectDatabaseError(response, 'createUser', error);
        });
};
