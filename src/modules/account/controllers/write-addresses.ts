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
import type { CastError } from 'mongoose';
import { AddAddressBody, UpdateAddressBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { AddressInput, UpdateAddressRequest } from '@types';
import { accountService } from '../services';

/**
 * POST /account/addresses — add an entry.
 *
 * The first entry becomes the default whether or not it asked; a later one claims the slot only by
 * saying so, and demotes the holder in the same write. Both invariants live in the service.
 */
export const postAddress = (
    request: Request<unknown, unknown, AddressInput>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    const parseResult = AddAddressBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    return accountService
        .addressAdd(id, parseResult.data)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'postAddress', error);
        });
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
    const { id } = request.authContext!;
    const { addressId } = request.params;

    const parseResult = UpdateAddressBody.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    return accountService
        .addressUpdate(id, addressId, parseResult.data)
        .then((result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            successResponse(response, result.data, 200, result.message);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'putAddress', error);
        });
};
