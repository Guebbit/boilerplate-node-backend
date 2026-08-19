import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@infrastructure/i18n';
import { userService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput } from '@infrastructure/http/request';
import { resolveImageUrl } from '@infrastructure/http/uploads';
import { imageStore } from '@infrastructure/adapters/image-store';
import type {
    CreateUserRequest,
    CreateUserRequestMultipart,
    UpdateUserRequest,
    UpdateUserRequestMultipart,
    UpdateUserByIdRequest,
    UpdateUserByIdRequestMultipart,
    User
} from '@types';
import type { UserRecord } from '../model';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { usersAuditActions } from '../audit';

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
    const { id, admin, active } = readInput(request, {
        surface: 'write',
        ids: ['id'],
        booleans: ['admin', 'active']
    });

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const imageUrlFile = resolveImageUrl(request);
    const imageUrl = imageUrlFile ?? (request.body as { imageUrl?: string }).imageUrl ?? '';
    // If problem arises: remove the image THIS request uploaded — `imageUrlFile`, deliberately,
    // and not the merged `imageUrl`: a body-supplied url names an image this request did not
    // create, and deleting it because validation failed would destroy someone else's file.
    const deleteUpload = () => imageStore.remove(imageUrlFile);

    /**
     * Validation errors prevent creation end editing
     */
    const errors = userService.validateData({
        ...request.body,
        imageUrl,
        admin,
        active
    });
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
    // records what the validator just established rather than assuming it.
    const validated = { imageUrl, admin, active } as Pick<User, 'imageUrl' | 'admin' | 'active'>;

    /**
     * NO ID = new user
     */
    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, [t('generic.error-missing-data')]);
            return deleteUpload();
        }

        return userService
            .create({
                // After validation it will be compatible for sure
                ...(request.body as UserRecord),
                ...validated
            })
            .then((user) => {
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: usersAuditActions.ADMIN_USER_CREATED,
                        outcome: 'success',
                        target_type: 'user',
                        target_id: String(user._id)
                    })
                );
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
        .updateById(id, { ...request.body, ...validated })
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.errors);
                });
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: usersAuditActions.ADMIN_USER_UPDATED,
                    outcome: 'success',
                    target_type: 'user',
                    target_id: id
                })
            );
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
