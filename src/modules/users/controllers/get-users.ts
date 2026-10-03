/**
 * @module
 * Controller for `GET /users` and `POST /users/search` — admin listing/search via query
 * parameters or body.
 *
 * See: docs/modules/users.md
 */

import { SearchUsersBody } from '@api/schemas.zod';
import { userService } from '../services';
import { optionalBooleanSchema, pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import { levelsOfMany, rolesOfMany } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { User } from '@types';
import type { PaginatedMeta } from '@infrastructure/persistence/search';

/**
 * Extends the orval-generated `SearchUsersBody`; page/pageSize and `active` are coerced from
 * strings since GET carries them as query text, not JSON types. page/pageSize and `active` come
 * from the shared http schemas so all search endpoints agree on what's legal; absent stays
 * absent, since `normalizePagination` owns the defaults.
 */
const searchUsersQuerySchema = SearchUsersBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    active: optionalBooleanSchema,
    deleted: optionalBooleanSchema
});

/**
 * GET /users
 * List/search users via query parameters (admin only).
 *
 * `toUser` needs each row's CURRENT role, read fresh from the membership store the same way
 * `GET /users/:id` does — batched into one `$in` query for the whole page rather than one lookup
 * per item, since `applyUserTransform`'s own document serialization has no role to offer. The
 * same page gets each row's level in two more, for the `actions` the caller's rank decides.
 * `userService.search()`'s items are already lean-and-transformed (`.id`, not `._id` — see
 * `createRepository`'s own `normalize`), so `.id` is read directly rather than re-derived.
 */
export const getUsers = createSearchController({
    entity: 'users',
    schema: searchUsersQuerySchema,
    runSearch: (parsed, request): Promise<{ items: User[]; meta: PaginatedMeta }> =>
        userService.search(parsed).then(({ items, meta }) => {
            const ids = items.map((user) => user.id);

            return Promise.all([rolesOfMany(ids, DEPLOYMENT_TENANT_ID), levelsOfMany(ids)]).then(
                ([roles, levels]) => ({
                    // `request.caller`, always set behind `requirePermission`: each row says what
                    // THIS caller may do to it (the route's key and the rank rule).
                    items: items.map((user) =>
                        userService.toUser(
                            user,
                            roles.get(user.id) ?? null,
                            request.caller &&
                                userService.userActionsFor(
                                    user.id,
                                    levels.get(user.id) ?? 'user',
                                    request.caller
                                )
                        )
                    ),
                    meta
                })
            );
        })
});
