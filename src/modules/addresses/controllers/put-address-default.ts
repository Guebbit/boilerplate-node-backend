/**
 * @module
 * `PUT /account/addresses/:addressId/default` controller — thin HTTP adapter over
 * `addressSetDefault`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import type { Address } from '@types';
import { requireId } from '@infrastructure/http/ids';
import { addressSetDefault } from '../service';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * PUT /account/addresses/:addressId/default — make one entry the book's default.
 * No body: the URI is the whole statement, so sending it twice leaves the same state (RFC 9110
 * §9.3.4). Answers the entry; the holder it demoted is another row, so a client refetches the book.
 */
export const putAddressDefault = (request: Request<{ addressId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    const addressId = requireId(request, response, {
        notFound: 'addresses.not-found',
        name: 'addressId'
    });
    if (!addressId) return;

    return addressSetDefault(id, addressId)
        .then((result) => {
            if (refused(response, result)) return;

            const { data, message } = result;
            successResponse<Address>(response, data, 200, message);
        })
        .catch(catchAs(response, 'putAddressDefault'));
};
