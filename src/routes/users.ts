import express from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';

import { listUsers, getUser, createUser, updateUser, deleteUser } from '@controllers/api/users';

const router = express.Router();

// Populate req.user from JWT token
router.use(getAuth);

// All users routes are admin-only
router.get('/', isAuth, isAdmin, listUsers);

router.get('/:id', isAuth, isAdmin, getUser);

router.post('/', isAuth, isAdmin, createUser);

router.put('/:id', isAuth, isAdmin, updateUser);

router.delete('/:id', isAuth, isAdmin, deleteUser);

export default router;

