import type { Request, Response } from 'express';
import { createAccessToken } from '@middlewares/auth-jwt';
import { rejectResponse, successResponse } from '@utils/response';
import { runTokenCleanup } from '@utils/token-cleanup';

/**
 * GET /account/refresh
 * Refresh access token.
 * Given the refreshToken from the URL or, if not, from the user cookies:
 * create a new short-lived access token for the following requests.
 */
export const getRefreshToken = async (request: Request<{ token?: string }>, response: Response) => {
    /**
     * Get token
     * (name of the cookie decided in the post-login.ts controller)
     */
    const refreshToken =
        request.params.token ?? (request.cookies as Record<string, string | undefined>).jwt;

    /**
     * Check if refresh token is missing
     */
    if (!refreshToken) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }

    /**
     * Create new access token using refresh token stored in the server
     */
    await runTokenCleanup();

    try {
        const token = await createAccessToken(refreshToken);
        successResponse(response, { token });
    } catch {
        rejectResponse(response, 401, 'Unauthorized');
    }
};

