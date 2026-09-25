/**
 * @module
 * Adding an entry to the address book — the one shipping-address write left that isn't PUT/PATCH
 * on an existing entry. The edit half moved to `./update-address.ts`, built on the shared
 * PUT/PATCH factory (AUDIT_0924 D17d). The read lives in `./get-addresses.ts`, the removal in
 * `./delete-address.ts`.
 */

import type { Request, Response } from 'express';
import { AddAddressBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import type { AddressInput, AddressesResponse } from '@types';
import { addressAdd } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /account/addresses — add an entry.
 * The first entry becomes the default automatically; a later one claims the slot only by saying
 * so, demoting the holder in the same write — one read-modify-write, owned by `repository.ts`
 * (see its docblock and `service.ts`).
 */
export const postAddress = (
    request: Request<unknown, unknown, AddressInput>,
    response: Response
) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    const body = parseBody(AddAddressBody, request.body, response);
    if (!body) return;

    return addressAdd(id, body)
        .then((result) => {
            if (refused(response, result)) return;
            const { data, message } = result;
            successResponse<AddressesResponse>(response, data, 200, message);
        })
        .catch(catchAs(response, 'postAddress'));
};
