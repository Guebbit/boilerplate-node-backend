import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { accountService } from '../services';

/**
 * GET /account/addresses — the caller's whole address book.
 *
 * Short because reading a book genuinely is one service call. Every write in
 * `./write-addresses.ts` and `./delete-address.ts` answers with this same whole-book view, so a
 * client never has to re-read after changing an entry.
 */
export const getAddresses = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return accountService
        .addressesGet(id)
        .then((view) => {
            successResponse(response, view);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getAddresses', error);
        });
};
