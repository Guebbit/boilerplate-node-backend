/**
 * @module
 * `GET /account/addresses/:addressId` controller — thin HTTP adapter over `addressService.get`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import type { Address } from '@types';
import { requireId } from '@infrastructure/http/ids';
import { addressService } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * GET /account/addresses/:addressId — one entry of the caller's own book. Someone else's entry,
 * an unknown id and a malformed one all answer the same 404.
 */
export const getAddress = (request: Request<{ addressId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const addressId = requireId(request, response, {
        notFound: 'addresses.not-found',
        name: 'addressId'
    });
    if (!addressId) return Promise.resolve();

    return addressService
        .get(id, addressId)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Address>(response, result.data, 200);
        })
        .catch(catchAs(response, 'getAddress'));
};
