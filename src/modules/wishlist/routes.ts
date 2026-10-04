/**
 * @module
 * The wishlist route table.
 *
 * A wishlist is somebody's, so the whole router is authenticated and none of it is admin. The one
 * thing that can silently break is ORDER: `/:productId/move-to-cart` must be declared before the
 * bare `/:productId` routes, or a move-to-cart is read as a product id called "move-to-cart".
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { getWishlist } from './controllers/get-wishlist';
import { putWishlistItem } from './controllers/put-wishlist-item';
import { deleteWishlistItem } from './controllers/delete-wishlist-item';
import { postMoveToCart } from './controllers/post-move-to-cart';

/** Express router for wishlist operations (save, unsave, move to cart). */
export const router = Router();

// All wishlist routes require authentication — a wishlist is somebody's.
router.use(getAuth, isAuth);

// GET /wishlist
router.get('/', getWishlist);

// POST /wishlist/:productId/move-to-cart — must come before the bare /:productId routes.
// `cart.self.update`: the move writes a basket, and staff and administrators do not shop.
router.post('/:productId/move-to-cart', requirePermission('cart.self.update'), postMoveToCart);

// PUT /wishlist/:productId — save a product. The URI is the whole statement; repeating it is a no-op.
router.put('/:productId', putWishlistItem);

// DELETE /wishlist/:productId — remove one saved product
router.delete('/:productId', deleteWishlistItem);
