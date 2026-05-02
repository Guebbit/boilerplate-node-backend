import type { Request, Response } from 'express';
import { t } from 'i18next';
import { rejectResponse, successResponse } from '@utils/response';
import type { UpdateSuspiciousAlertRequest } from '@types';
import { activityEventService } from '@services/activity-events';

export const putSuspiciousAlert = (
    request: Request<{ id: string }, unknown, UpdateSuspiciousAlertRequest>,
    response: Response
) =>
    activityEventService
        .updateSuspiciousAlert(request.params.id, {
            resolved: request.body?.resolved,
            notes: request.body?.notes
        })
        .then((event) => successResponse(response, event.toObject()))
        .catch((error: Error) => {
            if (error.message === '404')
                return rejectResponse(response, 404, 'Not Found', [t('generic.error-missing-data')]);
            return rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
