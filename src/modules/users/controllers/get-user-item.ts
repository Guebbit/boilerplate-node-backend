import { userService } from '../service';
import { createItemController } from '@infrastructure/http/create-item-controller';

/**
 * GET /users/:id
 * Get a single user by path id (admin).
 */
export const getUserItem = createItemController({
    entity: 'user',
    notFoundKey: 'users.not-found',
    fetch: (id) => userService.getById(id)
});
