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
 */
export const deleteUsers = createDeleteController({
    entity: 'user',
    remove: (id, hardDelete) => userService.removeById(id, hardDelete),
    auditAction: usersAuditActions.ADMIN_USER_DELETED,
    notFoundKey: 'users.not-found'
});
