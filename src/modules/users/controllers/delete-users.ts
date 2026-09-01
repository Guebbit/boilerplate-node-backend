/**
 * @module
 * Controller for `DELETE /users` and `DELETE /users/:id` — admin soft/hard delete.
 *
 * See: docs/modules/users.md
 */

import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { userService } from '../service';
import { usersAuditActions } from '../audit';

/**
 * DELETE /users — delete a user by id in the request body (admin).
 * DELETE /users/:id — delete by path id. `?hardDelete=true` deletes permanently, else soft.
 * Hard delete announces `USER_DELETED`, cascading to cart, wishlist and address book.
 *
 * Only `?hardDelete=true` discharges an Art. 17 erasure request — the audit
 * action names which one happened, so the trail itself can answer that question later.
 */
export const deleteUsers = createDeleteController({
    entity: 'user',
    remove: (id, hardDelete) => userService.removeById(id, hardDelete),
    auditAction: (hardDelete) =>
        hardDelete
            ? usersAuditActions.ADMIN_USER_ERASED
            : usersAuditActions.ADMIN_USER_SOFT_DELETED,
    notFoundKey: 'users.not-found'
});
