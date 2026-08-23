import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { upload } from '@infrastructure/adapters/storage';
import { getUsers, searchUsersKeyParameters } from './controllers/get-users';
import { writeUsers } from './controllers/write-users';
import { deleteUsers } from './controllers/delete-users';
import { getUserItem } from './controllers/get-user-item';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/** Express router for user management (admin only). */
export const router = Router();

// All routes require authentication + admin role
router.use(getAuth, isAuth, isAdmin);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post(
    '/search',
    setCache(3600, {
        tags: ['users'],
        keyParameters: searchUsersKeyParameters,
        keyAs: 'users:search'
    }),
    getUsers
);

// GET /users
router.get(
    '/',
    setCache(3600, {
        tags: ['users'],
        keyParameters: searchUsersKeyParameters,
        keyAs: 'users:search'
    }),
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
