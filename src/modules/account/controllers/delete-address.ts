import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/addresses/:addressId — remove one entry.
 *
 * Singular, like the URL it serves and like `wishlist/controllers/delete-wishlist-item.ts`: this
 * removes one entry, never the book.
 *
 * Removing the default promotes the oldest remaining entry, so a book is never left with entries
 * and no default — `repository.ts` owns that, and the answer here is the whole book so the caller sees
 * where the flag landed without a second request.
 */
export const deleteAddress = (request: Request<{ addressId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);
    const { addressId } = request.params;

    return accountService
        .addressRemove(id, addressId)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'deleteAddress'));
};
