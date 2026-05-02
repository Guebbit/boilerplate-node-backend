import { Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import type { SearchActivityEventsRequest, ActivityEventsResponse } from '@types';
import {
    EActivityEventType,
    EActivitySeverity,
    type IActivityEventDocument
} from '@models/activity-events';
import { activityEventRepository } from '@repositories/activity-events';

const FAILED_LOGIN_WINDOW_MINUTES = 15;
const FAILED_LOGIN_SUSPICIOUS_THRESHOLD = 5;
const MILLISECONDS_PER_MINUTE = 60_000;

type ActivitySearchFilters = SearchActivityEventsRequest & { type?: EActivityEventType };

export const search = (filters: ActivitySearchFilters = {}): Promise<ActivityEventsResponse> => {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: QueryFilter<IActivityEventDocument> = {};

    if (filters.type) where.type = filters.type;
    if (filters.actorUserId && String(filters.actorUserId).trim() !== '')
        where.actorUserId = new Types.ObjectId(String(filters.actorUserId));
    if (filters.targetEmail && String(filters.targetEmail).trim() !== '')
        where.targetEmail = { $regex: String(filters.targetEmail).trim(), $options: 'i' };
    if (filters.resolved !== undefined && filters.resolved !== null) where.resolved = filters.resolved;
    if (filters.text && String(filters.text).trim() !== '') {
        const text = String(filters.text).trim();
        where.$or = [
            { route: { $regex: text, $options: 'i' } },
            { method: { $regex: text, $options: 'i' } },
            { notes: { $regex: text, $options: 'i' } },
            { targetEmail: { $regex: text, $options: 'i' } }
        ];
    }

    return activityEventRepository.count(where).then((totalItems) =>
        activityEventRepository
            .findAll(where, {
                sort: { createdAt: -1 },
                skip,
                limit: pageSize
            })
            .then((items) => ({
                items: items as unknown as ActivityEventsResponse['items'],
                meta: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize)
                }
            }))
    );
};

type LogAdminActivityInput = {
    actorUserId?: string;
    method?: string;
    route?: string;
    ipAddress?: string;
    userAgent?: string;
    statusCode?: number;
};

export const logAdminActivity = (input: LogAdminActivityInput) =>
    activityEventRepository.create({
        type: EActivityEventType.ADMIN_ACTIVITY,
        severity: EActivitySeverity.INFO,
        resolved: true,
        actorUserId: input.actorUserId ? new Types.ObjectId(input.actorUserId) : undefined,
        method: input.method,
        route: input.route,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        statusCode: input.statusCode
    });

type LogLoginAttemptInput = {
    email: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
};

export const logLoginAttempt = (input: LogLoginAttemptInput) => {
    const eventType = input.success ? EActivityEventType.LOGIN_SUCCESS : EActivityEventType.LOGIN_FAILED;

    return activityEventRepository
        .create({
            type: eventType,
            severity: input.success ? EActivitySeverity.INFO : EActivitySeverity.WARNING,
            resolved: input.success,
            targetEmail: input.email,
            targetUserId: input.userId ? new Types.ObjectId(input.userId) : undefined,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent
        })
        .then(() => {
            if (input.success) return;

            const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MINUTES * MILLISECONDS_PER_MINUTE);
            const where: QueryFilter<IActivityEventDocument> = {
                type: EActivityEventType.LOGIN_FAILED,
                createdAt: { $gte: since },
                targetEmail: input.email
            };
            if (input.ipAddress) where.ipAddress = input.ipAddress;

            return activityEventRepository.count(where).then((failedAttemptsInWindow) => {
                if (failedAttemptsInWindow < FAILED_LOGIN_SUSPICIOUS_THRESHOLD) return;

                return activityEventRepository.create({
                    type: EActivityEventType.SUSPICIOUS_ACTIVITY,
                    severity: EActivitySeverity.CRITICAL,
                    resolved: false,
                    targetEmail: input.email,
                    targetUserId: input.userId ? new Types.ObjectId(input.userId) : undefined,
                    ipAddress: input.ipAddress,
                    userAgent: input.userAgent,
                    metadata: {
                        failedAttemptsInWindow,
                        windowMinutes: FAILED_LOGIN_WINDOW_MINUTES
                    }
                });
            });
        });
};

export const updateSuspiciousAlert = (
    id: string,
    payload: { resolved?: boolean; notes?: string }
): Promise<IActivityEventDocument> =>
    activityEventRepository.findById(id).then((event) => {
        if (!event || event.type !== EActivityEventType.SUSPICIOUS_ACTIVITY) throw new Error('404');
        if (payload.resolved !== undefined) event.resolved = payload.resolved;
        if (payload.notes !== undefined) event.notes = payload.notes;
        return activityEventRepository.save(event);
    });

export const activityEventService = {
    search,
    logAdminActivity,
    logLoginAttempt,
    updateSuspiciousAlert
};
