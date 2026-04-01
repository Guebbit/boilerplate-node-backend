import express from 'express';
import { isAuth, isAdmin } from '@middlewares/authorizations';
import { csrfSynchronisedProtection } from '@middlewares/csrf';
import multer from '@utils/multer';

import { pageAllUsers } from '@controllers/users/page-all-users';
import { pageTargetUser } from '@controllers/users/page-target-user';
import { pageEditUser } from '@controllers/users/page-edit-user';
import { postWriteUser } from '@controllers/users/post-write-user';
import { postDeleteUser } from '@controllers/users/post-delete-user';

const router = express.Router();

// All users routes are admin-only
router.get('/details/:userId', isAuth, isAdmin, pageTargetUser);

router.get('/add', isAuth, isAdmin, pageEditUser);

router.post(
    '/add',
    isAuth,
    isAdmin,
    multer.single('imageUpload'),
    csrfSynchronisedProtection,
    postWriteUser
);

router.get('/edit/:userId', isAuth, isAdmin, pageEditUser);

router.post(
    '/edit/:userId',
    isAuth,
    isAdmin,
    multer.single('imageUpload'),
    csrfSynchronisedProtection,
    postWriteUser
);

router.post('/delete', isAuth, isAdmin, csrfSynchronisedProtection, postDeleteUser);

router.get('/:page', isAuth, isAdmin, pageAllUsers);

router.get('/', isAuth, isAdmin, pageAllUsers);

export default router;
