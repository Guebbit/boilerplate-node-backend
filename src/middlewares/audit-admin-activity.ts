import type { Request, Response, NextFunction } from 'express';
import { activityEventService } from '@services/activity-events';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const auditAdminActivity = (request: Request, response: Response, next: NextFunction) => {
    response.once('finish', () => {
        if (!request.user?.admin) return;
        if (!MUTATION_METHODS.has(request.method)) return;
        if (response.statusCode < 200 || response.statusCode >= 400) return;

        void activityEventService
            .logAdminActivity({
                actorUserId: request.user.id,
                method: request.method,
                route: request.originalUrl,
                ipAddress: request.ip,
                userAgent: request.get('user-agent'),
                statusCode: response.statusCode
            })
            .catch(() => {});
    });
    next();
};
