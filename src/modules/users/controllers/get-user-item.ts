/**
 * @module
 * Controller for `GET /users/:id` — a single user by path id, admin only.
 *
 * See: docs/modules/users.md
 */

import { recordStaffRead } from '@kernel/staff-read';
import { userService } from '../services';
import { usersAuditActions } from '../audit';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 *
 * `toUserContract` reads the caller's CURRENT role fresh from the membership store — the
 * document holds none of its own. One extra indexed lookup per read, same cost class as
 * every other authorization check this endpoint already sits behind.
 */
export const getUserItem = createItemController({
    entity: 'user',
    notFoundKey: 'users.not-found',
    fetch: (id, request) =>
        userService.getById(id).then((user) => {
            if (!user) return undefined;
            recordStaffRead(request, {
                key: 'users.any.read',
                action: usersAuditActions.ADMIN_USER_VIEWED,
                targetType: 'user',
                targetId: id,
                ownerId: id
            });
            return userService.toUserContract(user, request.caller);
        })
});
