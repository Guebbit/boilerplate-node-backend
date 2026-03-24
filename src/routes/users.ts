import express from 'express';
import { isAuth, isAdmin } from "../middlewares/authorizations";

import { pageAllUsers } from "../controllers/users/page-all-users";
import { pageTargetUser } from "../controllers/users/page-target-user";
import { postCreateUser, putEditUser, putEditUserById } from "../controllers/users/post-edit-user";
import { postDeleteUser, deleteUserById } from "../controllers/users/post-delete-user";
import { postSearchUsers } from "../controllers/users/post-search-users";

const router = express.Router();

// All users routes are admin-only

// POST /users/search — search users with body filters (must be before /:userId)
router.post('/search', isAuth, isAdmin, postSearchUsers);

// GET /users — list users (paginated)
router.get('/', isAuth, isAdmin, pageAllUsers);

// POST /users — create a new user
router.post('/', isAuth, isAdmin, postCreateUser);

// PUT /users — update user with id in body
router.put('/', isAuth, isAdmin, putEditUser);

// DELETE /users — delete user with id in body
router.delete('/', isAuth, isAdmin, postDeleteUser);

// GET /users/:userId — get a single user
router.get('/:userId', isAuth, isAdmin, pageTargetUser);

// PUT /users/:userId — update a specific user
router.put('/:userId', isAuth, isAdmin, putEditUserById);

// DELETE /users/:userId — delete a specific user
router.delete('/:userId', isAuth, isAdmin, deleteUserById);

export default router;
