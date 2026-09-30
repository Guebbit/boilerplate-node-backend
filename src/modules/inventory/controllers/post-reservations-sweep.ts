/**
 * @module
 * POST /inventory/reservations/sweep
 * The expiry tick's on-demand door — `npm run sweep:reservations` (`docker/crontab`) is the
 * actual recurring schedule, and never reaches this route. This is for an operator, or a
 * platform scheduler that prefers HTTP. Audited once per run rather than per order (the orders'
 * own cancel path covers those), so a customer asking why their order vanished has something on
 * record.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { inventoryService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import type { ReservationSweepResponse } from '@types';

/** Handles `POST /inventory/reservations/sweep`. */
export const postReservationsSweep = (request: Request, response: Response) =>
    inventoryService
        .runReservationSweep(callerContextOf(request))
        .then((expired) => {
            successResponse<ReservationSweepResponse>(
                response,
                { expired },
                200,
                t('inventory.sweep-success')
            );
        })
        .catch(catchAs(response, 'postReservationsSweep'));
