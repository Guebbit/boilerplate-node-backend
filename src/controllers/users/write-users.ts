import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@core/i18n';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@core/http/response';
import { readInput } from '@core/http/request';
import { resolveImageUrl } from '@core/http/uploads';
import { imageStore } from '@core/adapters/image-store';
import type {
    CreateUserRequest,
    CreateUserRequestMultipart,
    UpdateUserRequest,
    UpdateUserRequestMultipart,
    UpdateUserByIdRequest,
    UpdateUserByIdRequestMultipart,
    User
} from '@types';
import type { IUser } from '@models/users';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';

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
        sources: ['params', 'body'],
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
        return deleteUpload().then(() => {
            rejectResponse(response, 422, 'writeUser - validation failed', errors);
        });

    // Past the guard above, these have been checked against zodUserSchema — the assertion
    // records what the validator just established rather than assuming it.
    const validated = { imageUrl, admin, active } as Pick<User, 'imageUrl' | 'admin' | 'active'>;

    /**
     * NO ID = new user
     */
    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, 'updateUser - missing id', [
                t('generic.error-missing-data')
            ]);
            return deleteUpload();
        }

        return userService
            .adminCreate({
                // After validation it will be compatible for sure
                ...(request.body as IUser),
                ...validated
            })
            .then((user) => {
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.ADMIN_USER_CREATED,
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
                    rejectResponse(response, 500, 'writeUser', [error.message]);
                })
            );
    }

    /**
     * ID = edit user
     */
    return userService.adminUpdateById(id, { ...request.body, ...validated }).then((result) => {
        if (!result.success)
            return deleteUpload().then(() => {
                rejectResponse(response, result.status, result.message, result.errors);
            });
        emitAuditEvent(
            buildAuditEvent(request, {
                action: AuditAction.ADMIN_USER_UPDATED,
                outcome: 'success',
                target_type: 'user',
                target_id: id
            })
        );
        successResponse(response, result.data);
    });
};
