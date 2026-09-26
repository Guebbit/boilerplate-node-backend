/**
 * @module
 * Controller for `POST /users` — staff create. The update half lives in `update-user.ts`.
 *
 * See: docs/modules/users.md
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { userService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/http/uploads';
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
    // One declaration instead of a per-field assembly — see docs/theory/request-input.md.
    // `booleans` are the fields whose type a multipart body cannot carry.
    // `role` needs no coercion — it arrives as the string it is, on every surface.
    const { active, sendSetupEmail } = readInput(request, {
        surface: 'create',
        booleans: ['active', 'sendSetupEmail']
    });
    // `?? {}`: express 5 leaves `request.body` unset when no parser matched the content-type,
    // and multer does not fill it in on a non-multipart body either. No cast needed: `role` is
    // already on every branch of `request.body`'s own generated type, declared above.
    const { role } = request.body ?? {};

    // No `= ''` default: `''` is invalid input (`ImageUrl`'s own `minLength: 1`), and `undefined` already means "no change" to `zodUserSchema`'s
    // `.optional()` field the same way an absent key does — a defaulted empty string would
    // reach the validator as a rejected value instead of the no-op it is meant to be.
    const { imageUrl, thumbnailUrl, pendingImageKey, deleteUpload } = readUploadedImage(request);

    /**
     * `false`: password is never required at this schema layer. A create may satisfy it via
     * `sendSetupEmail` instead — the either/or the schema can't express, enforced by
     * `userService.create` itself instead of here.
     */
    const errors = userService.validateData(
        {
            ...request.body,
            imageUrl,
            role,
            active
        },
        false
    );
    if (errors.length > 0) {
        rejectResponse(response, 422, errors);
        // `deleteUpload` never rejects (imageStore.remove/removeQuarantined both resolve on
        // failure — see image-store.ts), so the response need not wait on it, and no catch is
        // needed to keep a storage hiccup from becoming a second, different failure.
        return deleteUpload();
    }

    // Past the guard above, these have been checked against zodUserSchema — the assertion
    // records what the validator just established rather than assuming it. `thumbnailUrl` is on
    // `User` itself (readOnly on the contract); `pendingImageKey` is not, so it joins via an
    // intersection — both are server-derived, never client-supplied.
    const validated = { imageUrl, role, active, thumbnailUrl, pendingImageKey } as Pick<
        User,
        'imageUrl' | 'role' | 'active' | 'thumbnailUrl'
    > & { pendingImageKey?: string };

    return userService
        .create(
            {
                /*
                 * Named off the SERVICE's own parameter rather than off `../model`: what this
                 * body has to satisfy is what `create` accepts, and a controller that names
                 * the stored shape starts changing every time the schema does. After
                 * validation it is compatible for sure.
                 */
                ...(request.body as Parameters<typeof userService.create>[0]),
                ...validated,
                sendSetupEmail: sendSetupEmail as boolean | undefined
            },
            callerContextOf(request)
        )
        .then((result) => {
            if (!result.success)
                return deleteUpload()
                    .catch(() => undefined)
                    .then(() => {
                        rejectResponse(response, result.status, result.errors);
                    });
            // `toUserContract` picks only the `User` contract's own fields, so the hashed
            // password and tokens on the document never reach `res.json`. The role is read
            // fresh from the membership just written — never off the document, which holds none.
            return userService.toUserContract(result.data).then((contract) => {
                successResponse<User>(response, contract, 201);
            });
        })
        .catch((error: unknown) =>
            deleteUpload()
                .catch(() => undefined)
                .then(() => {
                    rejectDatabaseError(response, 'createUser', error);
                })
        );
};
