import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { upload } from '@utils/multer';
import { getUsers } from '@controllers/users/get-users';
import { writeUsers } from '@controllers/users/write-users';
import { deleteUsers } from '@controllers/users/delete-users';
import { getUserItem } from '@controllers/users/get-user-item';
import { invalidateCache, setCache } from '@utils/helpers-response';

export const router = Router();

// All routes require authentication + admin role
router.use(getAuth, isAuth, isAdmin);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post('/search', getUsers);

// GET /users
router.get('/', setCache(3600, { tags: ['users'] }), getUsers);

// POST /users (create)
router.post('/', invalidateCache(['users', 'account']), upload.single('imageUpload'), writeUsers);

// PUT /users — id in body (update)
router.put('/', invalidateCache(['users', 'account']), upload.single('imageUpload'), writeUsers);

// DELETE /users — id in body
router.delete('/', invalidateCache(['users', 'account']), deleteUsers);

// GET /users/:id
router.get('/:id', setCache(3600, { tags: ['users'] }), getUserItem);

// PUT /users/:id (update)
router.put('/:id', invalidateCache(['users', 'account']), upload.single('imageUpload'), writeUsers);

// DELETE /users/:id
router.delete('/:id', invalidateCache(['users', 'account']), deleteUsers);
