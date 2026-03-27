import express from 'express';
import { isAuth, isAdmin } from "@middlewares/authorizations";

import { pageAllUsers } from "@controllers/users/page-all-users";
import { pageTargetUser } from "@controllers/users/page-target-user";
import { pageEditUser } from "@controllers/users/page-edit-user";
import { postEditUser } from "@controllers/users/post-edit-user";
import { postDeleteUser } from "@controllers/users/post-delete-user";

const router = express.Router();

// All users routes are admin-only
router.get('/details/:userId', isAuth, isAdmin, pageTargetUser);

router.get('/add', isAuth, isAdmin, pageEditUser);

router.post('/add', isAuth, isAdmin, postEditUser);

router.get('/edit/:userId', isAuth, isAdmin, pageEditUser);

router.post('/edit/:userId', isAuth, isAdmin, postEditUser);

router.post('/delete', isAuth, isAdmin, postDeleteUser);

router.get('/:page', isAuth, isAdmin, pageAllUsers);

router.get('/', isAuth, isAdmin, pageAllUsers);

export default router;
