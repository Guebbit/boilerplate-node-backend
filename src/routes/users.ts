import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { upload } from '@core/adapters/storage';
import { getUsers, searchUsersKeyParameters } from '@controllers/users/get-users';
import { writeUsers } from '@controllers/users/write-users';
import { deleteUsers } from '@controllers/users/delete-users';
import { getUserItem } from '@controllers/users/get-user-item';
import { invalidateCache, setCache } from '@middlewares/cache';
import { routeFlag } from '@middlewares/route-flag';

/** Express router for user management (admin only). */
export const router = Router();

// All routes require authentication + admin role
router.use(getAuth, isAuth, isAdmin);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post('/search', getUsers);

// GET /users
router.get(
    '/',
    setCache(3600, { tags: ['users'], keyParameters: searchUsersKeyParameters }),
    getUsers
);

// POST /users (create)
router.post('/', invalidateCache(['users', 'account']), upload.single('imageUpload'), writeUsers);

// PUT /users — id in body (update)
router.put('/', invalidateCache(['users', 'account']), upload.single('imageUpload'), writeUsers);

// DELETE /users — id in body
router.delete('/', invalidateCache(['users', 'account']), deleteUsers);

// GET /users/:id
router.get('/:id', setCache(3600, { tags: ['users'], keyParameters: [] }), getUserItem);

// PUT /users/:id (update)
router.put('/:id', invalidateCache(['users', 'account']), upload.single('imageUpload'), writeUsers);

// DELETE /users/:id — soft delete unless ?hardDelete=true
router.delete('/:id', invalidateCache(['users', 'account']), deleteUsers);

// DELETE /users/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    invalidateCache(['users', 'account']),
    routeFlag('hardDelete'),
    deleteUsers
);
