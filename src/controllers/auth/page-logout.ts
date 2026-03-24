import type { Request, Response } from "express";
import { successResponse } from "@utils/response";

/**
 * Logout (GET /account/logout)
 * For a stateless JWT API, the server does not maintain sessions.
 * The client is responsible for discarding the token on its side.
 * This endpoint exists for compatibility and returns a success confirmation.
 *
 * @param request
 * @param response
 */
export const getLogout = (_request: Request, response: Response) =>
    successResponse(response, undefined, 200, 'Logged out successfully');
