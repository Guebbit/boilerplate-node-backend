import { createDeleteController } from '@infrastructure/surfaces/create-delete-controller';
import { userService } from '../service';
import { usersAuditActions } from '../audit';

/**
 * DELETE /users — delete a user by id in the request body (admin).
 * DELETE /users/:id — delete a user by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 *
 * The hard path announces `USER_DELETED`, which is what takes the account's cart, wishlist and
 * address book with it.
 */
export const deleteUsers = createDeleteController({
    entity: 'user',
    remove: (id, hardDelete) => userService.removeById(id, hardDelete),
    auditAction: usersAuditActions.ADMIN_USER_DELETED,
    notFoundKey: 'users.not-found'
});
