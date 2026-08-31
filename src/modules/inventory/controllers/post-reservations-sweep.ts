/**
 * @module
 * POST /inventory/reservations/sweep
 *
 * The expiry tick. The application ships no scheduler, so the tick is driven from outside — a
 * cron entry, the platform's scheduled job, or an operator — the same arrangement as
 * `POST /delivery/advance`, and the same reason.
 *
 * Audited because it cancels customers' orders. Not one row per order — the orders' own cancel
 * path audits those — but one row per RUN, recording that a human pressed the button and how
 * many holds it took with it. Without it, a customer asking why their order vanished has only
 * the cancellations to look at and nothing saying what caused them.
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
