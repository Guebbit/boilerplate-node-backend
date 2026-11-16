/**
 * @module
 * Controller for `DELETE /users/:id` and its `/hard` form — admin soft/hard delete.
 *
 * @see docs/modules/users.md#soft-delete-vs-erasure
 */

import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { userService } from '../services';

/**
 * DELETE /users/:id — delete by path id (admin). `?hardDelete=true` deletes permanently, else soft.
 * Hard delete runs every registered `personalData.erase` hook in one transaction. The list of hooks
 * is the generated neighbourhood diagram of the users page, not named here, where it would go stale
 * silently.
 *
 * @see docs/modules/users.md#its-neighbourhood
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
