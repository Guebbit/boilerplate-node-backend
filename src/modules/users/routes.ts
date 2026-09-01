/**
 * @module
 * The admin-only `/users` router: search, item read, write and delete, wired to the shared
 * response cache and the route-flag middleware the hard-delete endpoint uses.
 *
 * See: docs/modules/users.md
 */

import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/adapters/storage';
import { getUsers, searchUsersKeyParameters } from './controllers/get-users';
import { writeUsers } from './controllers/write-users';
import { deleteUsers } from './controllers/delete-users';
import { getUserItem } from './controllers/get-user-item';
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/** Express router for user management (admin only). */
export const router = Router();

// All routes require authentication + admin role
router.use(getAuth, isAuth, isAdmin);

/** Cache reader keyed on the same query parameters `getUsers`'s schema accepts. */
const cacheUsersSearch = searchCache('users', searchUsersKeyParameters);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post('/search', cacheUsersSearch, getUsers);

// GET /users
router.get('/', cacheUsersSearch, getUsers);

// POST /users (create)
router.post(
    '/',
    uploadLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    writeUsers
);

// PUT /users — id in body (update)
router.put(
    '/',
    uploadLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    writeUsers
);

// DELETE /users — id in body
router.delete('/', invalidateCache(['users', 'account']), deleteUsers);

// GET /users/:id
router.get('/:id', setCache(3600, { tags: ['users'], keyParameters: [] }), getUserItem);

// PUT /users/:id (update)
router.put(
    '/:id',
    uploadLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    writeUsers
);

// DELETE /users/:id — soft delete unless ?hardDelete=true
router.delete('/:id', invalidateCache(['users', 'account']), deleteUsers);

// DELETE /users/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    invalidateCache(['users', 'account']),
    routeFlag('hardDelete'),
    deleteUsers
);
