/**
 * @module
 * Controller for `POST /users/:id/restore` — undo an admin soft delete.
 *
 * See: docs/modules/users.md
 */

import { createRestoreController } from '@infrastructure/surfaces/create-restore-controller';
import { userService } from '../service';
import { usersAuditActions } from '../audit';

/** POST /users/:id/restore — undo a soft delete (admin). 409 when the account is not deleted. */
export const restoreUsers = createRestoreController({
    entity: 'user',
    restore: (id) => userService.restoreById(id),
    present: (user) => userService.toUserContract(user),
    auditAction: usersAuditActions.ADMIN_USER_RESTORED,
    notFoundKey: 'users.not-found'
});
