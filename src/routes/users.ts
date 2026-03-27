import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import {
    listUsers,
    createUser,
    updateUser,
    deleteUser,
    searchUsers,
    getUserById,
    updateUserById,
    deleteUserById,
} from '@controllers/users';

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
