/**
 * @module
 * Controller for `POST /users` — staff create. The update half lives in `update-user.ts`.
 *
 * See: docs/modules/users.md
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { userService } from '../services';
import { rejectResponse, createdResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { parseBody } from '@infrastructure/http/controller';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { claimUpload, readUploadedImage } from '@infrastructure/http/uploads';
import { CreateUserBody } from '@api/schemas.zod';
import type { CreateUserRequest, CreateUserRequestMultipart, User } from '@types';

/**
 * POST /users — staff create.
 */
export const createUser = (
    request: Request<
        ParamsDictionary,
        unknown,
        | CreateUserRequest
        | CreateUserRequestMultipart
        // Express 5 leaves `request.body` UNDEFINED when no parser matched the content-type, and
        // multer does not fill it in on a non-multipart body either.
        | undefined
    >,
    response: Response
) => {
    // No `= ''` default: `''` is invalid input (`ImageUrl`'s own `minLength: 1`), and `undefined` already means "no change" to `zodUserSchema`'s
    // `.optional()` field the same way an absent key does — a defaulted empty string would
    // reach the validator as a rejected value instead of the no-op it is meant to be.
    const { imageUrl, thumbnailUrl, pendingImageKey } = readUploadedImage(request);

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

    /**
     * `false`: the password is never part of this body — the owner chooses it through the setup
     * email `userService.create` queues.
     */
    const errors = userService.validateData(
        {
            ...body,
            role,
            active
        },
        false
    );
    if (errors.length > 0) {
        rejectResponse(response, 422, errors);
        return;
    }

    // Past the guard above, these have been checked against zodUserSchema — the assertion
    // records what the validator just established rather than assuming it. `thumbnailUrl` is on
    // `User` itself (readOnly on the contract); `pendingImageKey` is not, so it joins via an
    // intersection — both are server-derived, never client-supplied.
    const validated = { role, active, thumbnailUrl, pendingImageKey } as Pick<
        User,
        'role' | 'active' | 'thumbnailUrl'
    > & { pendingImageKey?: string };

    return userService
        .create(
            {
                ...body,
                ...validated,
                // Server-decided, so it joins only after the body was validated as `null`-only.
                imageUrl
            },
            callerContextOf(request)
        )
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            claimUpload(request);
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
