/**
 * @module
 * `DELETE /account/addresses/:addressId` controller — thin HTTP adapter over `addressService.remove`.
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { addressService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /account/addresses/:addressId — remove one entry, never the whole book.
 * Removing the default promotes the oldest remaining entry (`repository.ts` owns that); the
 * answer carries no body, so a client showing the book refetches it to see where the flag landed.
 */
export const deleteAddress = (request: Request<{ addressId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const addressId = requireId(request, response, {
        notFound: 'addresses.not-found',
        name: 'addressId'
    });
    if (!addressId) return;

    return addressService
        .remove(id, addressId)
        .then((result) => {
            if (refused(response, result)) return;

            noContentResponse(response);
        })
        .catch(catchAs(response, 'deleteAddress'));
};
