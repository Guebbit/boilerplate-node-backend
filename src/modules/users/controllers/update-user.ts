/**
 * @module
 * Controllers for `PUT /users/:id` (replace) and `PATCH /users/:id` (merge), built on the shared
 * `createUpdateController` factory.
 *
 * See: docs/modules/users.md
 */

import { callerContextOf } from '@infrastructure/http/request';
import { writeWithUploadedImage } from '@infrastructure/http/uploads';
import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { ReplaceUserByIdBody, UpdateUserByIdBody } from '@api/schemas.zod';
import { userService } from '../service';

/**
 * `PUT /users/:id` and `PATCH /users/:id` — one handler pair over `userService.updateById`, which
 * merges the fields and audits the change itself (the ban/unban split included).
 */
export const { replace: replaceUser, update: updateUser } = createUpdateController({
    entity: 'user',
    replaceSchema: ReplaceUserByIdBody,
    patchSchema: UpdateUserByIdBody,
    // The one boolean an edit carrying an avatar (multipart) sends as a string.
    input: { booleans: ['active'] },
    update: (id, changes, request) =>
        writeWithUploadedImage(request, changes.imageUrl, (image) =>
            userService.updateById(id, { ...changes, ...image }, callerContextOf(request))
        ),
    present: (user) => userService.toUserContract(user)
});
