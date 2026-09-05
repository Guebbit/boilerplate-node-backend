/**
 * @module
 * Adding an entry to the address book, and editing one — the two shipping-address writes a
 * caller makes. One file for both, like `products/controllers/write-products.ts`: they run the
 * same three steps (parse body, call the service, branch on `result.success`), so a shape change
 * has one place to land. The read lives in `./get-addresses.ts`, the removal in
 * `./delete-address.ts` — neither parses a body, so neither shares this shape.
 */

import type { Request, Response } from 'express';
import { AddAddressBody, UpdateAddressBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { AddressInput, UpdateAddressRequest, AddressesResponse } from '@types';
import { accountService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * POST /account/addresses — add an entry.
 * The first entry becomes the default automatically; a later one claims the slot only by saying
 * so, demoting the holder in the same write — one read-modify-write, owned by `repository.ts`
 * (see its docblock and `services/addresses.ts`).
 */
export const postAddress = (
    request: Request<unknown, unknown, AddressInput>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);

    const body = parseBody(AddAddressBody, request.body, response);
    if (!body) return;

    return accountService
        .addressAdd(id, body)
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
        .catch(catchAs(response, 'postAddress'));
};

/**
 * PUT /account/addresses/:addressId — edit an entry.
 *
 * An entry the caller does not hold answers the same 404 as one that never existed: ownership is
 * checked in the service, and a distinguishable answer would confirm the id belongs to somebody.
 */
export const putAddress = (
    request: Request<{ addressId: string }, unknown, UpdateAddressRequest>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);
    const { addressId } = request.params;

    const body = parseBody(UpdateAddressBody, request.body, response);
    if (!body) return;

    return accountService
        .addressUpdate(id, addressId, body)
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
        .catch(catchAs(response, 'putAddress'));
};
