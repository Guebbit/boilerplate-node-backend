import type { Request, Response } from "express";
import { successResponse } from "@utils/response";

/**
 * Health check endpoint
 * GET /health
 *
 * @param request
 * @param response
 */
export const getHome = (_request: Request, response: Response) =>
    successResponse(response, {
        status: 'ok',
        version: process.env.npm_package_version ?? '1.0.0',
    }, 200, 'Service is running');