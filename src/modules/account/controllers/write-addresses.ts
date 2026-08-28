/**
 * Adding an entry to the address book, and editing one — the two shipping addresses a caller
 * writes.
 *
 * One file for both, on the same grounds as `products/controllers/write-products.ts`: they are not
 * merely similar in length, they run the same three steps in the same order — parse a body against
 * its generated schema and answer 422 on a miss, call the one service function, then branch on
 * `result.success` and answer with the whole book either way. Split apart, an edit to that shape
 * has two places to land and no reason to reach both.
 *
 * The read lives in `./get-addresses.ts` and the removal in `./delete-address.ts`, because neither
 * parses a body and so neither shares the shape this file is named for.
 */
import type { Request, Response } from 'express';
import { AddAddressBody, UpdateAddressBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import type { AddressInput, UpdateAddressRequest } from '@types';
import { accountService } from '../services';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * POST /account/addresses — add an entry.
 *
 * The first entry becomes the default whether or not it asked; a later one claims the slot only by
 * saying so, and demotes the holder in the same write. Both invariants live in `repository.ts`,
 * which owns them because holding the slot and moving it are one read-modify-write — see the
 * docblock there, and `services/addresses.ts`, which says the same.
 */
export const postAddress = (
    request: Request<unknown, unknown, AddressInput>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);

    const parseResult = AddAddressBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return accountService
        .addressAdd(id, parseResult.data)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
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

    const parseResult = UpdateAddressBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return accountService
        .addressUpdate(id, addressId, parseResult.data)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'putAddress'));
};
