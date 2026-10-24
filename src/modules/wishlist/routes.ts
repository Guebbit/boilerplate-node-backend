/**
 * @module
 * The wishlist route table.
 *
 * A wishlist is somebody's, so the whole router is authenticated and none of it is admin. A saved
 * product is a line of it, written through `/items` (docs/api/write-methods.md#a-line-is-written-through-its-parent).
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { getWishlist } from './controllers/get-wishlist';
import { postWishlistItems } from './controllers/post-wishlist-items';
import { deleteWishlistItem } from './controllers/delete-wishlist-item';
import { postMoveToCart } from './controllers/post-move-to-cart';

/** Express router for wishlist operations (save, unsave, move to cart). */
export const router = Router();

// All wishlist routes require authentication — a wishlist is somebody's.
router.use(getAuth, isAuth);

// GET /wishlist
router.get('/', getWishlist);

// POST /wishlist/items — save a product. Saving what is saved is a no-op.
router.post('/items', postWishlistItems);

// POST /wishlist/items/:productId/move-to-cart
// `update:Cart`: the move writes the caller's own basket.
router.post('/items/:productId/move-to-cart', requirePermission('update', 'Cart'), postMoveToCart);

// DELETE /wishlist/items/:productId — remove one saved product
router.delete('/items/:productId', deleteWishlistItem);
