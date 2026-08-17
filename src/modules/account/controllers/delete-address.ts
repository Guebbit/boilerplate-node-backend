import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { accountService } from '../services';

/**
 * DELETE /account/addresses/:addressId — remove one entry.
 *
 * Singular, like the URL it serves and like `wishlist/controllers/delete-wishlist-item.ts`: this
 * removes one entry, never the book.
 *
 * Removing the default promotes the oldest remaining entry, so a book is never left with entries
 * and no default — the service owns that, and the answer here is the whole book so the caller sees
 * where the flag landed without a second request.
 */
export const deleteAddress = (request: Request<{ addressId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const { addressId } = request.params;

    return accountService
        .addressRemove(id, addressId)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'deleteAddress', error);
        });
};
