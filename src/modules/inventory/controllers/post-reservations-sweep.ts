/**
 * @module
 * POST /inventory/reservations/sweep
 * The expiry tick, driven from outside since the app ships no scheduler — same arrangement as
 * `POST /delivery/advance`. Audited once per run rather than per order (the orders' own cancel
 * path covers those), so a customer asking why their order vanished has something on record.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { inventoryService } from '../service';
import { catchAs } from '@infrastructure/http/controller';

/** Handles `POST /inventory/reservations/sweep`. */
export const postReservationsSweep = (request: Request, response: Response) =>
    inventoryService
        .runReservationSweep(callerContextOf(request))
        .then((expired) => {
            successResponse(response, { expired }, 200, t('inventory.sweep-success'));
        })
        .catch(catchAs(response, 'postReservationsSweep'));
