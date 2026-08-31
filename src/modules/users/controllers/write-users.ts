/**
 * @module
 * Controller for `POST /users`, `PUT /users` and `PUT /users/:id` — admin create/update, with
 * the create-vs-update branch decided by whether an id is present.
 *
 * See: docs/modules/users.md
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@infrastructure/i18n';
import { userService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/adapters/image-store';
import type {
    CreateUserRequest,
    CreateUserRequestMultipart,
    UpdateUserRequest,
    UpdateUserRequestMultipart,
    UpdateUserByIdRequest,
    UpdateUserByIdRequestMultipart,
    User
} from '@types';

/**
 * POST /users — create a new user (admin).
 * PUT /users — update a user by id in the request body (admin).
 * PUT /users/:id — update a user by path id (admin).
 *
 * Behaviour: if an id is found (path param or body), the user is updated;
 * otherwise a new user is created (POST only — PUT without id returns 422).
 */
export const writeUsers = (
    request: Request<
        ParamsDictionary,
        unknown,
        | CreateUserRequest
        | CreateUserRequestMultipart
        | UpdateUserRequest
        | UpdateUserRequestMultipart
        | UpdateUserByIdRequest
        | UpdateUserByIdRequestMultipart
    >,
    response: Response
) => {
    // One declaration instead of a per-field assembly — see docs/theory/request-input.md.
    // `booleans` are the fields whose type a multipart body cannot carry.
    const { id, admin, active, sendSetupEmail } = readInput(request, {
        surface: 'write',
        ids: ['id'],
        booleans: ['admin', 'active', 'sendSetupEmail']
    });

    // `= ''` because `zodUserSchema` wants a string: an absent image is an empty url here.
    const {
        imageUrl = '',
        thumbnailUrl,
        pendingImageKey,
        deleteUpload
    } = readUploadedImage(request);

    /**
     * Validation errors prevent creation end editing.
     *
     * `false`: password is never required at this schema layer, on either branch. An edit may
     * leave it untouched (see `userService.update`), and a create may leave it to `sendSetupEmail`
     * below instead of stating one — that combination is a business rule this schema cannot express
     * on its own, so it is checked separately, just past the `!id` guard.
     */
    const errors = userService.validateData(
        {
            ...request.body,
            imageUrl,
            admin,
            active
        },
        false
    );
    if (errors.length > 0)
        return (
            deleteUpload()
                // The answer does not depend on the cleanup succeeding. Without this catch, a
                // storage backend having a bad moment turns a plain 422 into a 500 — and the
                // client is told the server broke when what it sent was simply invalid.
                .catch(() => undefined)
                .then(() => {
                    rejectResponse(response, 422, errors);
                })
        );

    // Past the guard above, these have been checked against zodUserSchema — the assertion
    // records what the validator just established rather than assuming it. `thumbnailUrl` is on
    // `User` itself (readOnly on the contract); `pendingImageKey` is not, so it joins via an
    // intersection — both are server-derived, never client-supplied.
    const validated = { imageUrl, admin, active, thumbnailUrl, pendingImageKey } as Pick<
        User,
        'imageUrl' | 'admin' | 'active' | 'thumbnailUrl'
    > & { pendingImageKey?: string };

    /**
     * NO ID = new user
     */
    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, [t('generic.error-missing-data')]);
            return deleteUpload();
        }

        // Neither a password nor a way to get one to the user: `userService.create` would fill
        // the field with a value nobody is ever told and leave the account permanently unusable.
        const { password } = request.body as { password?: string };
        if (!password && !sendSetupEmail) {
            rejectResponse(response, 422, [t('users.field-password-or-setup-required')]);
            return deleteUpload();
        }

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
            .then((user) => {
                // create() returns the in-memory document; the schema's toJSON transform
                // strips the hashed password before it ever reaches res.json
                successResponse(response, user, 201);
            })
            .catch((error: Error) =>
                deleteUpload().then(() => {
                    rejectDatabaseError(response, 'writeUser', error);
                })
            );
    }

    /**
     * ID = edit user
     */
    return userService
        .updateById(id, { ...request.body, ...validated }, callerContextOf(request))
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.errors);
                });
            successResponse(response, result.data);
        })
        .catch((error: Error) =>
            // Matches the create branch above: an upload this request wrote must not survive a
            // failed write, or the file is orphaned with nothing referencing it.
            deleteUpload().then(() => {
                rejectDatabaseError(response, 'writeUser', error);
            })
        );
};
