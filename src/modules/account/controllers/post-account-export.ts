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
 * POST /account/export — the caller's own data, assembled from every collection that holds some.
 *
 * NOT typed `successResponse<AccountExportResponse>`: `result.data` (`AccountExportPayload`, see
 * `services/export.ts`) carries raw documents for `profile`/`orders`/`shipments`/`auditLog` whose
 * contract-shaped fields (`User`'s ISO timestamps, `Order.totalItems/totalQuantity/totalPrice`,
 * `Shipment.id`, `ExportAuditEntry.timestamp` as a string) exist only after each schema's own
 * `toJSON` transform runs, never on the document type itself. Closing that gap needs a wire mapper
 * per document type — `orders`/`delivery`/`audit-logs` do not export one today.
 */
export const postAccountExport = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return exportOwnData(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'postAccountExport'));
};
