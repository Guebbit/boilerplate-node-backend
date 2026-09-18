/**
 * @module
 * `POST /account/export` controller — thin HTTP adapter over `exportOwnData`. Imported straight
 * from `../services/export` rather than off `accountService`: see that barrel's own docblock for
 * why the data-export function stays out of it. `requireFreshAuth` (mounted on the route) is the
 * identity proof; there is nothing else for this controller to check.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { exportOwnData } from '../services/export';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/export — the caller's own data, assembled from every registered
 * {@link import('@kernel/registry').PersonalDataSection}.
 *
 * NOT typed `successResponse<AccountExportResponse>`: each section's own `collect` returns raw
 * documents whose contract-shaped fields (`User`'s ISO timestamps, `Order`'s computed totals,
 * `Shipment.id`, an audit entry's `timestamp` as a string) exist only after that document's own
 * `toJSON` transform runs, never on the document type itself — and this controller has no way to
 * know every contributing module's shape statically. Closing that gap needs a wire mapper per
 * document type; the envelope validation on the way out is what actually holds this to the
 * contract today.
 */
export const postAccountExport = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id, email } = request.authContext!;

    return exportOwnData(id, email, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'postAccountExport'));
};
