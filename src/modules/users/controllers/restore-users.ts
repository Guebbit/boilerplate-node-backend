/**
 * @module
 * Controller for `POST /users/:id/restore` — undo an admin soft delete.
 *
 * See: docs/modules/users.md
 */

import { createRestoreController } from '@infrastructure/surfaces/create-restore-controller';
import { callerContextOf } from '@infrastructure/http/request';
import { userService } from '../services';

/**
 * POST /users/:id/restore — undo a soft delete (admin). 409 when the account is not deleted.
 * `userService.restoreById` owns the `ADMIN_USER_RESTORED` audit emit.
 */
export const restoreUsers = createRestoreController({
    entity: 'user',
    restore: (id, request) => userService.restoreById(id, callerContextOf(request)),
    present: (user, request) => userService.toUserContract(user, request.caller),
    notFoundKey: 'users.not-found'
});
