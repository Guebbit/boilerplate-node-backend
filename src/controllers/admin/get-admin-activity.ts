import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import type { SearchActivityEventsRequest } from '@types';
import { successResponse, rejectResponse } from '@utils/response';
import { extractPagination } from '@utils/helpers-request';
import { EActivityEventType } from '@models/activity-events';
import { activityEventService } from '@services/activity-events';

type ActivityQuery = Partial<Record<keyof SearchActivityEventsRequest, string>>;

const normalizeFilters = (
    request: Request<unknown, unknown, SearchActivityEventsRequest, ActivityQuery>
): SearchActivityEventsRequest => {
    const { page, pageSize } = extractPagination({
        page: request.body?.page ?? request.query.page,
        pageSize: request.body?.pageSize ?? request.query.pageSize
    });
    const resolvedRaw = request.body?.resolved ?? request.query.resolved;

    return {
        page,
        pageSize,
        text: request.body?.text ?? request.query.text,
        actorUserId: request.body?.actorUserId ?? request.query.actorUserId,
        targetEmail: request.body?.targetEmail ?? request.query.targetEmail,
        resolved:
            resolvedRaw === undefined
                ? undefined
                : String(resolvedRaw).toLowerCase() === 'true' || resolvedRaw === true
    };
};

const createGetByTypeController =
    (type: EActivityEventType) =>
    (
        request: Request<unknown, unknown, SearchActivityEventsRequest, ActivityQuery>,
        response: Response
    ) =>
        activityEventService
            .search({
                ...normalizeFilters(request),
                type
            })
            .then((result) => successResponse(response, result))
            .catch((error: CastError) => rejectResponse(response, 500, 'Unknown Error', [error.message]));

export const getAdminActivity = createGetByTypeController(EActivityEventType.ADMIN_ACTIVITY);
export const getLoginHistory = createGetByTypeController(EActivityEventType.LOGIN_SUCCESS);
export const getFailedLogins = createGetByTypeController(EActivityEventType.LOGIN_FAILED);
export const getSuspiciousAlerts = createGetByTypeController(EActivityEventType.SUSPICIOUS_ACTIVITY);
