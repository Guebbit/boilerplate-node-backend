/**
 * @module
 * The admin-only `/users` router: search, item read, write and delete, wired to the shared
 * response cache and the route-flag middleware the hard-delete endpoint uses.
 *
 * See: docs/modules/users.md
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/http/middlewares/upload';
import { getUsers, searchUsersKeyParameters } from './controllers/get-users';
import { writeUsers } from './controllers/write-users';
import { deleteUsers } from './controllers/delete-users';
import { getUserItem } from './controllers/get-user-item';
import { deleteUserTwoFactor } from './controllers/delete-user-two-factor';
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/** Express router for user management (admin only). */
export const router = Router();

// Every route below needs a caller, but not the SAME key — `manager` reads and `support` reads
// and updates, and a router-wide gate on one key made the other unreachable no matter what the
// role file granted. Each mount below states the one key its own action needs.
// `isAuthOrCredential`, not `isAuth`: an `sk_...` api key may reach this module.
// Every route here is a `users.any.*` key over the tenant's directory — a partner
// integration syncing accounts is the documented use case. No controller reads `authContext`.
router.use(getAuth, isAuthOrCredential);

/** Cache reader keyed on the same query parameters `getUsers`'s schema accepts. */
const cacheUsersSearch = searchCache('users', searchUsersKeyParameters);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post('/search', requirePermission('users.any.read'), cacheUsersSearch, getUsers);

// GET /users
router.get('/', requirePermission('users.any.read'), cacheUsersSearch, getUsers);

// POST /users (create)
router.post(
    '/',
    requirePermission('users.any.create'),
    uploadLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    writeUsers
);

// PUT /users — id in body (update)
router.put(
    '/',
    requirePermission('users.any.update'),
    uploadLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    writeUsers
);

// DELETE /users — id in body
router.delete(
    '/',
    requirePermission('users.any.delete'),
    invalidateCache(['users', 'account']),
    deleteUsers
);

// GET /users/:id
router.get(
    '/:id',
    requirePermission('users.any.read'),
    setCache(3600, { tags: ['users'], keyParameters: [] }),
    getUserItem
);

// PUT /users/:id (update)
router.put(
    '/:id',
    requirePermission('users.any.update'),
    uploadLimiter,
    invalidateCache(['users', 'account']),
    upload.single('imageUpload'),
    writeUsers
);

// DELETE /users/:id — soft delete unless ?hardDelete=true
router.delete(
    '/:id',
    requirePermission('users.any.delete'),
    invalidateCache(['users', 'account']),
    deleteUsers
);

// DELETE /users/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('users.any.delete'),
    invalidateCache(['users', 'account']),
    routeFlag('hardDelete'),
    deleteUsers
);

// DELETE /users/:id/2fa — admin-assisted 2FA recovery, no code required. The one deliberate
// exception to "prove the factor to remove it" — see the controller's own comment. Clearing a
// second factor is `users.any.update`'s own description in `shared/authorization-keys.yaml`.
router.delete(
    '/:id/2fa',
    requirePermission('users.any.update'),
    invalidateCache(['users', 'account']),
    deleteUserTwoFactor
);
