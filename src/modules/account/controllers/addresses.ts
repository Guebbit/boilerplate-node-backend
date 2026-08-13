/**
 * The address book's four handlers, in one file: they share every line of shape — auth from the
 * guard, one service call, the whole-book view in the answer — and differ only in which service
 * function they name. Four files of twelve lines each would be layout, not structure.
 */
import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { AddAddressBody, UpdateAddressBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { AddressInput, UpdateAddressRequest } from '@types';
import { addressesService } from '../addresses-service';

/**
 * GET /account/addresses
 */
export const getAddresses = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return addressesService
        .addressesGet(id)
        .then((view) => {
            successResponse(response, view);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getAddresses', error);
        });
};

/**
 * POST /account/addresses
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

    return addressesService
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
 * PUT /account/addresses/:addressId
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

    return addressesService
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

/**
 * DELETE /account/addresses/:addressId
 */
export const deleteAddress = (request: Request<{ addressId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const { addressId } = request.params;

    return addressesService
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
