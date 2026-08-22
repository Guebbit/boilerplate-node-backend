import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { deliveryAuditActions } from '../audit';
import { deliveryService } from '../service';
import { catchAs } from '@infrastructure/http/controller';

/**
 * POST /delivery/advance
 * The fake courier's tick, behind an admin endpoint the way the token cleanup is: this repo
 * deliberately has no scheduler, so an operator (or the demo's admin button) is the cron. Every
 * parcel currently on a truck arrives.
 */
export const postCourierAdvance = (request: Request, response: Response) =>
    deliveryService
        .runCourierAdvance()
        .then((advanced) => {
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: deliveryAuditActions.ADMIN_COURIER_ADVANCED,
                    outcome: 'success',
                    metadata: { advanced }
                })
            );
            successResponse(response, { advanced });
        })
        .catch(catchAs(response, 'postCourierAdvance'));
