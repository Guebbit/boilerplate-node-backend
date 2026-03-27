import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import logger from '@utils/winston';
import { rejectResponse } from '@utils/response';

/**
 * Global exception filter that formats all errors using the existing
 * rejectResponse utility so the API response shape stays consistent.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const context = host.switchToHttp();
        const response = context.getResponse<Response>();

        if (response.headersSent)
            return;

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            rejectResponse(response, status, exception.message);
            return;
        }

        const error = exception as Error;
        logger.error({
            message: error.message,
            stack: error.stack,
            name: error.name,
        });
        rejectResponse(response, 500, 'Internal Server Error', [error.message]);
    }
}
