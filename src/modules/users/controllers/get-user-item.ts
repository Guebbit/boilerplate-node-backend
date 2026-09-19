/**
 * @module
 * Controller for `GET /users/:id` — a single user by path id, admin only.
 *
 * See: docs/modules/users.md
 */

import { userService } from '../service';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 *
 * `toUserContract` reads the caller's CURRENT role fresh from the membership store — the
 * document holds none of its own any more. One extra indexed lookup per read, same cost class as
 * every other authorization check this endpoint already sits behind.
 */
export const getUserItem = createItemController({
    entity: 'user',
    notFoundKey: 'users.not-found',
    fetch: (id) =>
        userService
            .getById(id)
            .then((user) => (user ? userService.toUserContract(user) : undefined))
});
