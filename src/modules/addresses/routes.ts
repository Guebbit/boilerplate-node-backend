/**
 * @module
 * Express router for the address book, mounted at `/account` alongside `account`'s own router —
 * see `./module.ts` and `docs/modules/account.md` for the split. `getAuth` returns early when a
 * request already carries a resolved auth context, so mounting it here too costs nothing beyond
 * the first router that ran (`kernel/middlewares/authorizations.ts`'s `getAuth`).
 */

import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { noStore } from '@infrastructure/http/middlewares/cache';
import { getAddresses } from './controllers/get-addresses';
import { postAddress, putAddress } from './controllers/write-addresses';
import { deleteAddress } from './controllers/delete-address';

/** Express router for the address book. */
export const router = Router();

router.use(getAuth);

// Credentials and identity-adjacent data: never cacheable — same reasoning as account's own
// router.use(noStore).
router.use(noStore);

// GET /account/addresses — the caller's address book (requires auth)
router.get('/addresses', isAuth, getAddresses);

// POST /account/addresses — add an entry (requires auth)
router.post('/addresses', isAuth, postAddress);

// PUT /account/addresses/:addressId — update an entry (requires auth)
router.put('/addresses/:addressId', isAuth, putAddress);

// DELETE /account/addresses/:addressId — remove an entry (requires auth)
router.delete('/addresses/:addressId', isAuth, deleteAddress);
