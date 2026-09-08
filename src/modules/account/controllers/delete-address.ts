/**
 * @module
 * `DELETE /account/addresses/:addressId` controller — thin HTTP adapter over
 * `addressService.addressRemove`.
 */

import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { AddressesResponse } from '@types';
import { addressService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /account/addresses/:addressId — remove one entry, never the whole book.
 * Removing the default promotes the oldest remaining entry (`repository.ts` owns that); the
 * response returns the full list so the caller sees where the flag landed.
 */
export const deleteAddress = (request: Request<{ addressId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const { addressId } = request.params;

    return addressService
        .addressRemove(id, addressId)
        .then((result) => {
            if (refused(response, result)) return;

            const { data, message } = result;
            if (data === undefined) {
                // A success verdict without a book is a broken service contract, not a bad request.
                rejectResponse(response, 500, []);
                return;
            }

            successResponse<AddressesResponse>(response, data, 200, message);
        })
        .catch(catchAs(response, 'deleteAddress'));
};
