import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { successResponse } from '@utils/response';

/**
 * System controller – health check and welcome endpoint.
 * Replaces src/routes/index.ts.
 */
@Controller()
export class SystemController {
    /**
     * GET /
     * Health-check / welcome endpoint.
     */
    @Get()
    health(@Res() response: Response): void {
        successResponse(response, { status: 'ok' }, 200, 'API is running');
    }
}
