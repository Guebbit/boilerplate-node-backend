import type { Request, Response } from 'express';
import { adminService } from '@services/admin';
import { successResponse } from '@utils/response';

export const getAdminHealth = (_request: Request, response: Response): void => {
    successResponse(response, adminService.getHealthSummary(), 200, 'Health check');
};
