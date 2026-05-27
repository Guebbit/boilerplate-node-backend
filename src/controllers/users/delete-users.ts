import { userService } from '@services/users';
import { createDeleteController } from '@utils/helpers-request';
import { AuditAction } from '@utils/audit';

/**
 * DELETE /users — delete a user by id in the request body (admin).
 * DELETE /users/:id — delete a user by path id (admin).
 *
 * Pass ?hardDelete=true (query) or { hardDelete: true } (body) to permanently
 * delete; otherwise the user is soft-deleted (sets deletedAt).
 */
export const deleteUsers = createDeleteController({
    entityLabel: 'deleteUser',
    notFoundKey: 'ecommerce.user-not-found',
    auditAction: AuditAction.ADMIN_USER_DELETED,
    targetType: 'user',
    remove: (id, hardDelete) => userService.remove(id, !!hardDelete),
    supportsHardDelete: true
});
