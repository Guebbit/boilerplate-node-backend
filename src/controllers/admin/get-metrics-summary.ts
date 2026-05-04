import type { Request, Response } from 'express';
import { adminService } from '@services/admin';
import { successResponse, rejectResponse } from '@utils/response';

export const getAdminMetricsSummary = (_request: Request, response: Response): void => {
    void adminService
        .getMetricsSummary()
        .then((metricsSummary) => successResponse(response, metricsSummary, 200, 'Metrics summary'))
        .catch(() => rejectResponse(response, 500, 'Metrics unavailable'));
};
