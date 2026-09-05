/**
 * @module
 * Controller for `GET /users` and `POST /users/search` — admin listing/search via query
 * parameters or body.
 *
 * See: docs/modules/users.md
 */

import { z } from 'zod';
import { SearchUsersBody } from '@api/schemas.zod';
import { userService } from '../service';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';

/** A boolean as a query string spells it. Named once: three filters here need the same coercion. */
const queryBoolean = z.preprocess(
    (value) => (typeof value === 'string' ? value === 'true' : value),
    z.boolean().optional()
);

/**
 * Extends the orval-generated `SearchUsersBody`; page/pageSize and the three booleans are
 * coerced from strings since GET carries them as query text, not JSON types.
 * page/pageSize come from the shared http schemas so all search endpoints agree on what's
 * legal; absent stays absent, since `normalizePagination` owns the defaults.
 */
const searchUsersQuerySchema = SearchUsersBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    active: queryBoolean,
    admin: queryBoolean,
    verified: queryBoolean
});

/**
 * Query parameters that change this endpoint's answer, and therefore its cache key.
 * Derived from the schema rather than hand-listed: a parameter the controller reads but the
 * key omits would let two different requests share one cached response.
 */
export const searchUsersKeyParameters = Object.keys(searchUsersQuerySchema.shape);

/**
 * GET /users
 * List/search users via query parameters (admin only).
 */
export const getUsers = createSearchController({
    entity: 'users',
    schema: searchUsersQuerySchema,
    runSearch: (parsed) => userService.search(parsed)
});
