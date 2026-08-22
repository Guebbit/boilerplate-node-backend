import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { wishlistService } from '../service';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * GET /wishlist
 * The authenticated user's saved products — ids only, like the cart; the client joins them
 * against its own product store.
 */
export const getWishlist = (request: Request, response: Response) => {
    return wishlistService
        .wishlistGet(authContextOf(request).id)
        .then((view) => {
            successResponse(response, view);
        })
        .catch(catchAs(response, 'getWishlist'));
};
