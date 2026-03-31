import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import multer from '@utils/multer';
import getUsers from '@controllers/users/get-users';
import postUsers from '@controllers/users/post-users';
import putUsers from '@controllers/users/put-users';
import deleteUsers from '@controllers/users/delete-users';
import postUsersSearch from '@controllers/users/post-users-search';
import getUserById from '@controllers/users/get-user-by-id';
import putUserById from '@controllers/users/put-user-by-id';
import deleteUserById from '@controllers/users/delete-user-by-id';

const router = Router();

// All routes require authentication + admin role
router.use(getAuth, isAuth, isAdmin);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post('/search', postUsersSearch);

// GET /users
router.get('/', getUsers);

// POST /users
router.post('/', multer.single('imageUpload'), postUsers);

// PUT /users — id in body
router.put('/', multer.single('imageUpload'), putUsers);

// DELETE /users — id in body
router.delete('/', deleteUsers);

// GET /users/:id
router.get('/:id', getUserById);

// PUT /users/:id
router.put('/:id', multer.single('imageUpload'), putUserById);

// DELETE /users/:id
router.delete('/:id', deleteUserById);

export default router;
