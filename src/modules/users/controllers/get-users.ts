/**
 * @module
 * Controller for `GET /users` and `POST /users/search` — admin listing/search via query
 * parameters or body.
 *
 * @see docs/modules/users.md#the-list-row
 */

import { z } from 'zod';
import { SearchUsersBody } from '@api/schemas.zod';
import { userService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import { optionalBooleanSchema, pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import type { UserListItem } from '@types';
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
    deleted: optionalBooleanSchema,
    /** `true` only, as the contract says: there is no "not held" list, so `false` is a 422. */
    purchaseHold: optionalBooleanSchema.pipe(z.literal(true).optional()),
    purchaseHoldReview: optionalBooleanSchema.pipe(z.literal(true).optional())
});

/**
 * GET /users
 * List/search users via query parameters (admin only).
 *
 * Each row is a list item (`UserListItem`): what the table shows, never the whole record. Its CURRENT
 * role and the `actions` the caller's rank decides are read fresh by `userService.toUserListItems`,
 * batched for the whole page — `applyUserTransform`'s own document serialization has no role to offer. The caller is always set behind `requirePermission`.
 */
export const getUsers = createSearchController({
    entity: 'users',
    schema: searchUsersQuerySchema,
    runSearch: (parsed, request): Promise<{ items: UserListItem[]; meta: PaginatedMeta }> =>
        userService
            .search(parsed)
            .then(({ items, meta }) =>
                userService
                    .toUserListItems(items, callerContextOf(request).caller)
                    .then((contracts) => ({ items: contracts, meta }))
            )
});
