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
import { postAddress } from './controllers/post-address';
import { replaceAddress, updateAddress } from './controllers/update-address';
import { deleteAddress } from './controllers/delete-address';
import { putAddressDefault } from './controllers/put-address-default';

/** Express router for the address book. */
export const router = Router();

// Resolve the session for every route below; each route then says whether it needs one (`isAuth`).
router.use(getAuth);

// Credentials and identity-adjacent data: never cacheable — same reasoning as account's own
// router.use(noStore).
router.use(noStore);

// GET /account/addresses — the caller's address book (requires auth)
router.get('/addresses', isAuth, getAddresses);

// POST /account/addresses — add an entry (requires auth)
router.post('/addresses', isAuth, postAddress);

// PUT /account/addresses/:addressId — replace the entry (requires auth)
router.put('/addresses/:addressId', isAuth, replaceAddress);

// PATCH /account/addresses/:addressId — merge the fields sent (requires auth)
router.patch('/addresses/:addressId', isAuth, updateAddress);

// PUT /account/addresses/:addressId/default — make it the book's default (requires auth). The
// pointer is the book's, not one address's, so it is an action of its own rather than a field.
router.put('/addresses/:addressId/default', isAuth, putAddressDefault);

// DELETE /account/addresses/:addressId — remove an entry (requires auth)
router.delete('/addresses/:addressId', isAuth, deleteAddress);
