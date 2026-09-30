/**
 * @module
 * Controller for `DELETE /users` and `DELETE /users/:id` — admin soft/hard delete.
 *
 * See: docs/modules/users.md
 */

import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { userService } from '../services';

/**
 * DELETE /users — delete a user by id in the request body (admin).
 * DELETE /users/:id — delete by path id. `?hardDelete=true` deletes permanently, else soft.
 * Hard delete runs every registered `personalData.erase` hook (DDD-D6) in one transaction — see
 * docs/modules/users.md's generated neighbourhood diagram for the current list, checked on every
 * regenerate rather than named here, where it would go stale silently.
 *
 * Only `?hardDelete=true` discharges an Art. 17 erasure request — `userService.removeById` names
 * which one happened in the audit action it records, so the trail itself can answer that question
 * later.
 */
export const deleteUsers = createDeleteController({
    entity: 'user',
    remove: (id, hardDelete, request) =>
        userService.removeById(id, hardDelete, callerContextOf(request)),
    notFoundKey: 'users.not-found'
});
