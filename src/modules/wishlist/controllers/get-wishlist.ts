import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { wishlistService } from '../service';

/**
 * GET /wishlist
 * The authenticated user's saved products — ids only, like the cart; the client joins them
 * against its own product store.
 */
export const getWishlist = (request: Request, response: Response) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }

    return wishlistService
        .wishlistGet(request.authContext.id)
        .then((view) => {
            successResponse(response, view);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getWishlist', error);
        });
};
