/**
 * @module
 * Adding an entry to the address book. The edit lives in `./update-address.ts`, the read in
 * `./get-addresses.ts`, the removal in `./delete-address.ts`.
 */

import type { Request, Response } from 'express';
import { AddAddressBody } from '@api/schemas.zod';
import { createdResponse } from '@infrastructure/http/response';
import type { Address, AddressInput } from '@types';
import { addressAdd } from '../service';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /account/addresses — add an entry. Answers 201 with the entry and its `Location`.
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
            createdResponse<Address>(response, data, `/account/addresses/${data.id}`, message);
        })
        .catch(catchAs(response, 'postAddress'));
};
