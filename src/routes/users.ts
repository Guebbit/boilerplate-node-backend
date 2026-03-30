import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import listUsers from '@controllers/users/get-list';
import createUser from '@controllers/users/post-create';
import updateUser from '@controllers/users/put-update';
import deleteUser from '@controllers/users/delete';
import searchUsers from '@controllers/users/post-search';
import getUserById from '@controllers/users/get-by-id';
import updateUserById from '@controllers/users/put-update-by-id';
import deleteUserById from '@controllers/users/delete-by-id';

const router = Router();

// All routes require authentication + admin role
router.use(getAuth, isAuth, isAdmin);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post('/search', searchUsers);

// GET /users
router.get('/', listUsers);

// POST /users
router.post('/', createUser);

// PUT /users — id in body
router.put('/', updateUser);

// DELETE /users — id in body
router.delete('/', deleteUser);

// GET /users/:id
router.get('/:id', getUserById);

// PUT /users/:id
router.put('/:id', updateUserById);

// DELETE /users/:id
router.delete('/:id', deleteUserById);

export default router;
