import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { upload } from '@utils/multer';
import { getUsers } from '@controllers/users/get-users';
import { writeUsers } from '@controllers/users/write-users';
import { deleteUsers } from '@controllers/users/delete-users';
import { getUserItem } from '@controllers/users/get-user-item';

export const router = Router();

// All routes require authentication + admin role
router.use(getAuth, isAuth, isAdmin);

// POST /users/search — must come before /:id to avoid matching "search" as an id
router.post('/search', getUsers);

// GET /users
router.get('/', getUsers);

// POST /users (create)
router.post('/', upload.single('imageUpload'), writeUsers);

// PUT /users — id in body (update)
router.put('/', upload.single('imageUpload'), writeUsers);

// DELETE /users — id in body
router.delete('/', deleteUsers);

// GET /users/:id
router.get('/:id', getUserItem);

// PUT /users/:id (update)
router.put('/:id', upload.single('imageUpload'), writeUsers);

// DELETE /users/:id
router.delete('/:id', deleteUsers);
