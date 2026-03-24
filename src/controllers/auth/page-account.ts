import type { Request, Response } from "express";
import { successResponse } from "@utils/response";

/**
 * Get the current user's profile (GET /account)
 * Returns the authenticated user's data from the JWT-populated request.user.
 *
 * @param request
 * @param response
 */
export const pageAccount = (request: Request, response: Response) =>
    successResponse(response, request.user?.toObject());
