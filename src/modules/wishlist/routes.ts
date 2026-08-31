/**
 * @module
 * The wishlist route table.
 *
 * A wishlist is somebody's, so the whole router is authenticated and none of it is admin. The one
 * thing that can silently break is ORDER: `/:productId/move-to-cart` must be declared before the
 * bare `/:productId` routes, or a move-to-cart is read as a product id called "move-to-cart".
 */

import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { getWishlist } from './controllers/get-wishlist';
import { postWishlist } from './controllers/post-wishlist';
import { deleteWishlistItem } from './controllers/delete-wishlist-item';
import { postMoveToCart } from './controllers/post-move-to-cart';

/** Express router for wishlist operations (save, unsave, move to cart). */
export const router = Router();

// All wishlist routes require authentication — a wishlist is somebody's.
router.use(getAuth, isAuth);

// GET /wishlist
router.get('/', getWishlist);

// POST /wishlist — save a product (idempotent)
router.post('/', postWishlist);

// POST /wishlist/:productId/move-to-cart — must come before the bare /:productId routes
router.post('/:productId/move-to-cart', postMoveToCart);

// DELETE /wishlist/:productId — remove one saved product
router.delete('/:productId', deleteWishlistItem);
